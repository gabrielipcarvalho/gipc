package server

// /api/topology — real service topology from the k8s API. The service table is FIXED in code
// (labels verified against the live manifests); namespaces come from the client's compiled
// allowlist — nothing is request-supplied. Curation: per-node daemonsets (promtail/node-exporter)
// and kube-state-metrics are deliberately out — the table shows the SERVICES a visitor can reason
// about, not every agent. ANY namespace list error → whole 503 (never a partial payload, never
// cached) — the honest state during the pre-RBAC window and API-server blips alike.

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/k8s"
)

// podLister is the narrow seam topology needs from the k8s client (fake-able in tests —
// the podKiller pattern).
type podLister interface {
	ListPodsNS(ctx context.Context, ns, selector string) ([]k8s.Pod, error)
}

type topoService struct {
	Name      string    `json:"name"`
	Namespace string    `json:"namespace"`
	Status    string    `json:"status"` // up | degraded | down
	Pods      []topoPod `json:"pods"`
}

type topoPod struct {
	Name       string `json:"name"`
	Ready      bool   `json:"ready"`
	Phase      string `json:"phase"`
	Restarts   int    `json:"restarts"`
	Image      string `json:"image"`
	ImageShort string `json:"imageShort"`
	CommitURL  string `json:"commitUrl,omitempty"` // only for this repo's CI-pinned images
	AgeSeconds int64  `json:"ageSeconds"`
	Requests   string `json:"requests,omitempty"`
	Limits     string `json:"limits,omitempty"`
}

type topology struct {
	GeneratedAt time.Time     `json:"generatedAt"`
	Services    []topoService `json:"services"`
}

// serviceTable is the fixed set /api/topology reports on. Labels verified against the manifests
// + live cluster (app=<name> everywhere).
var serviceTable = []struct{ name, ns, selector string }{
	{"web", "gipc", "app=web"},
	{"core", "gipc", "app=core"},
	{"ai", "gipc", "app=ai"},
	{"ollama", "gipc", "app=ollama"},
	{"caddy", "gipc", "app=caddy"},
	{"postgres", "data", "app=postgres"},
	{"prometheus", "observability", "app=prometheus"},
	{"grafana", "observability", "app=grafana"},
	{"loki", "observability", "app=loki"},
	{"chaos-target", "demo", "app=chaos-target"},
}

// Refresh cost bound: one LIST per serviceTable row = 10 API-server LISTs per ≤5s worst case.
const (
	topoCacheTTL   = 5 * time.Second
	topoTimeout    = 4 * time.Second
	ownImagePrefix = "ghcr.io/gabrielipcarvalho/"
	commitURLBase  = "https://github.com/gabrielipcarvalho/gipc/commit/"
)

func isHexSHA(s string) bool {
	if len(s) != 40 {
		return false
	}
	for _, r := range s {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return true
}

func toTopoPod(p k8s.Pod) topoPod {
	image, tag := p.Image, ""
	if i := strings.LastIndex(image, ":"); i > 0 {
		tag = image[i+1:]
	}
	short := tag
	if isHexSHA(tag) {
		short = tag[:7]
	}
	out := topoPod{
		Name: p.Name, Ready: p.Ready, Phase: p.Phase, Restarts: p.Restarts,
		Image: image, ImageShort: short, AgeSeconds: p.AgeSeconds,
		Requests: p.Requests, Limits: p.Limits,
	}
	if isHexSHA(tag) && strings.HasPrefix(image, ownImagePrefix) {
		out.CommitURL = commitURLBase + tag
	}
	return out
}

// deriveStatus: Succeeded/Failed pods are excluded first (evicted leftovers must not fake
// "degraded"); then all ready → up, some → degraded, none → down.
func deriveStatus(pods []topoPod) (string, []topoPod) {
	active := make([]topoPod, 0, len(pods))
	for _, p := range pods {
		if p.Phase == "Succeeded" || p.Phase == "Failed" {
			continue
		}
		active = append(active, p)
	}
	ready := 0
	for _, p := range active {
		if p.Ready {
			ready++
		}
	}
	switch {
	case len(active) == 0 || ready == 0:
		return "down", active
	case ready == len(active):
		return "up", active
	default:
		return "degraded", active
	}
}

type topoCache struct {
	mu      sync.Mutex
	at      time.Time
	payload *topology
}

func topologyHandler(lister podLister, cache *topoCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if lister == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "topology unavailable"})
			return
		}
		cache.mu.Lock() // single-flight: one refresh at a time; followers reuse the fresh payload
		if cache.payload != nil && time.Since(cache.at) < topoCacheTTL {
			payload := cache.payload // snapshot; serialize OUTSIDE the lock (replace-only, never mutated)
			cache.mu.Unlock()
			writeJSON(w, http.StatusOK, payload)
			return
		}
		defer cache.mu.Unlock()
		ctx, cancel := context.WithTimeout(r.Context(), topoTimeout)
		defer cancel()

		type res struct {
			idx  int
			pods []k8s.Pod
			err  error
		}
		ch := make(chan res, len(serviceTable))
		for i, svc := range serviceTable {
			go func(i int, ns, sel string) {
				pods, err := lister.ListPodsNS(ctx, ns, sel)
				ch <- res{i, pods, err}
			}(i, svc.ns, svc.selector)
		}
		byIdx := make([][]k8s.Pod, len(serviceTable))
		for range serviceTable {
			r := <-ch
			if r.err != nil {
				// any failure → whole 503, never cached (partial truth reads as fabrication)
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "topology unavailable"})
				return
			}
			byIdx[r.idx] = r.pods
		}
		out := &topology{GeneratedAt: time.Now().UTC(), Services: make([]topoService, 0, len(serviceTable))}
		for i, svc := range serviceTable {
			pods := make([]topoPod, 0, len(byIdx[i]))
			for _, p := range byIdx[i] {
				pods = append(pods, toTopoPod(p))
			}
			status, active := deriveStatus(pods)
			out.Services = append(out.Services, topoService{
				Name: svc.name, Namespace: svc.ns, Status: status, Pods: active,
			})
		}
		cache.payload, cache.at = out, time.Now()
		writeJSON(w, http.StatusOK, out)
	}
}
