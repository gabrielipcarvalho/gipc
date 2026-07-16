// Package k8s is a tiny STDLIB-ONLY client for the in-cluster Kubernetes API — no client-go, no go.sum.
// It talks to the API server over net/http using the mounted ServiceAccount token + CA, and is
// deliberately narrow: MUTATIONS (DeletePod) stay fixed to the lab namespace (config.LabNamespace);
// READS may additionally list pods in a COMPILED namespace allowlist (topologyNamespaces — for
// /api/topology). No namespace is ever taken from a request, so there is no namespace-injection
// surface. When both the Lab and topology are disabled New returns a nil *Client, and every method on
// a nil client returns ErrDisabled — so callers can hold a nil client safely and 503 honestly.
package k8s

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

const (
	tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	caPath    = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
)

// ErrDisabled is returned by every method when the client is nil (Lab disabled / no ServiceAccount).
var ErrDisabled = errors.New("k8s client disabled")

// podNameRe matches a valid k8s pod name (RFC 1123 subdomain-ish). Validating the name BEFORE it enters
// the URL path is the real traversal defence: url.PathEscape alone doesn't help against a server that
// decodes %2F and path-cleans (RBAC would still deny cross-ns, but we close it at the source too).
var podNameRe = regexp.MustCompile(`^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$`)

func validPodName(s string) bool { return len(s) > 0 && len(s) <= 253 && podNameRe.MatchString(s) }

// Client is a minimal, namespace-fixed Kubernetes API client.
type Client struct {
	base  string // https://kubernetes.default.svc (or KUBERNETES_SERVICE_HOST:PORT)
	token string
	ns    string // the ONLY namespace this client touches
	http  *http.Client
}

// Pod is the trimmed pod view the Lab + topology need. NOTE: this struct is a public wire contract
// (serialized by /api/lab/chaos/status and /api/topology) — fields are additive-only.
type Pod struct {
	Name       string `json:"name"`
	Phase      string `json:"phase"`
	AgeSeconds int64  `json:"ageSeconds"`
	Ready      bool   `json:"ready"`    // AND of all containerStatuses; false when none reported (Pending)
	Restarts   int    `json:"restarts"` // SUM across containerStatuses
	Image      string `json:"image"`    // spec.containers[0].image — the exact manifest tag, never a resolved ref
	Requests   string `json:"requests"` // "cpu <v> · mem <v>" from spec.containers[0].resources ("" when unset)
	Limits     string `json:"limits"`
}

// topologyNamespaces is the COMPILED read allowlist for ListPodsNS — never request-supplied.
var topologyNamespaces = map[string]bool{"gipc": true, "observability": true, "data": true, "demo": true}

// New builds the in-cluster client. Returns (nil, nil) when both consumers are disabled.
func New(cfg config.Config) (*Client, error) {
	if !cfg.LabEnabled && !cfg.TopologyEnabled {
		return nil, nil
	}
	tok, err := os.ReadFile(tokenPath)
	if err != nil {
		return nil, fmt.Errorf("read sa token: %w", err)
	}
	ca, err := os.ReadFile(caPath)
	if err != nil {
		return nil, fmt.Errorf("read sa ca: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		return nil, errors.New("k8s: invalid CA bundle")
	}
	base := "https://kubernetes.default.svc"
	if host := os.Getenv("KUBERNETES_SERVICE_HOST"); host != "" {
		port := os.Getenv("KUBERNETES_SERVICE_PORT")
		if port == "" {
			port = "443"
		}
		base = "https://" + net.JoinHostPort(host, port)
	}
	return newWithBase(base, strings.TrimSpace(string(tok)), cfg.LabNamespace, &tls.Config{
		RootCAs:    pool,
		MinVersion: tls.VersionTLS12,
	}), nil
}

// newWithBase is the test seam — lets client_test.go point at an httptest server (no in-cluster files).
func newWithBase(base, token, ns string, tlsCfg *tls.Config) *Client {
	return &Client{
		base:  strings.TrimRight(base, "/"),
		token: token,
		ns:    ns,
		http:  &http.Client{Timeout: 4 * time.Second, Transport: &http.Transport{TLSClientConfig: tlsCfg}},
	}
}

// podList is the trimmed pods-LIST decode shared by ListPods + ListPodsNS.
type podList struct {
	Items []struct {
		Metadata struct {
			Name              string    `json:"name"`
			CreationTimestamp time.Time `json:"creationTimestamp"`
		} `json:"metadata"`
		Spec struct {
			Containers []struct {
				Image     string `json:"image"`
				Resources struct {
					Requests map[string]string `json:"requests"`
					Limits   map[string]string `json:"limits"`
				} `json:"resources"`
			} `json:"containers"`
		} `json:"spec"`
		Status struct {
			Phase             string `json:"phase"`
			ContainerStatuses []struct {
				Ready        bool `json:"ready"`
				RestartCount int  `json:"restartCount"`
			} `json:"containerStatuses"`
		} `json:"status"`
	} `json:"items"`
}

func resourcesLine(m map[string]string) string {
	if len(m) == 0 {
		return ""
	}
	cpu, mem := m["cpu"], m["memory"]
	switch {
	case cpu != "" && mem != "":
		return "cpu " + cpu + " · mem " + mem
	case cpu != "":
		return "cpu " + cpu
	default:
		return "mem " + mem
	}
}

func (c *Client) listPodsAt(ctx context.Context, ns, selector string) ([]Pod, error) {
	u := fmt.Sprintf("%s/api/v1/namespaces/%s/pods?labelSelector=%s",
		c.base, url.PathEscape(ns), url.QueryEscape(selector))
	var raw podList
	if err := c.do(ctx, http.MethodGet, u, &raw); err != nil {
		return nil, err
	}
	now := time.Now()
	pods := make([]Pod, 0, len(raw.Items))
	for _, it := range raw.Items {
		age := int64(0)
		if !it.Metadata.CreationTimestamp.IsZero() {
			age = int64(now.Sub(it.Metadata.CreationTimestamp).Seconds())
		}
		ready := len(it.Status.ContainerStatuses) > 0
		restarts := 0
		for _, cs := range it.Status.ContainerStatuses {
			if !cs.Ready {
				ready = false
			}
			restarts += cs.RestartCount
		}
		image, req, lim := "", "", ""
		if len(it.Spec.Containers) > 0 {
			image = it.Spec.Containers[0].Image
			req = resourcesLine(it.Spec.Containers[0].Resources.Requests)
			lim = resourcesLine(it.Spec.Containers[0].Resources.Limits)
		}
		pods = append(pods, Pod{
			Name: it.Metadata.Name, Phase: it.Status.Phase, AgeSeconds: age,
			Ready: ready, Restarts: restarts, Image: image, Requests: req, Limits: lim,
		})
	}
	return pods, nil
}

// ListPods returns the pods in the LAB namespace matching the label selector.
func (c *Client) ListPods(ctx context.Context, selector string) ([]Pod, error) {
	if c == nil {
		return nil, ErrDisabled
	}
	return c.listPodsAt(ctx, c.ns, selector)
}

// ListPodsNS lists pods in a namespace from the COMPILED topology allowlist. The ns is never
// request-supplied — handlers iterate a fixed service table.
func (c *Client) ListPodsNS(ctx context.Context, ns, selector string) ([]Pod, error) {
	if c == nil {
		return nil, ErrDisabled
	}
	if !topologyNamespaces[ns] {
		return nil, fmt.Errorf("k8s: namespace %q not in the topology allowlist", ns)
	}
	return c.listPodsAt(ctx, ns, selector)
}

// DeletePod deletes a pod by name in the fixed namespace. The caller must only pass a name it obtained
// from ListPods(chaos selector) — this client never widens the namespace.
func (c *Client) DeletePod(ctx context.Context, name string) error {
	if c == nil {
		return ErrDisabled
	}
	if !validPodName(name) {
		return fmt.Errorf("k8s: invalid pod name %q", name) // rejects /, .., and anything non-podname
	}
	u := fmt.Sprintf("%s/api/v1/namespaces/%s/pods/%s", c.base, url.PathEscape(c.ns), url.PathEscape(name))
	return c.do(ctx, http.MethodDelete, u, nil)
}

func (c *Client) do(ctx context.Context, method, u string, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); resp.Body.Close() }() // drain → keep-alive reuse
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Surface the k8s Status message, never the token.
		var s struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&s)
		if s.Message == "" {
			s.Message = resp.Status
		}
		return fmt.Errorf("k8s api %s: %s", method, s.Message)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}
