package k8s

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testClient(srv *httptest.Server) *Client {
	// point the client at the fake API server; nil tlsCfg → plain http.Client is fine for httptest
	return newWithBase(srv.URL, "test-token", "demo", nil)
}

func TestListPods(t *testing.T) {
	var gotPath, gotAuth string
	body := `{"items":[
		{"metadata":{"name":"chaos-target-a","creationTimestamp":"` +
		time.Now().Add(-30*time.Second).UTC().Format(time.RFC3339) + `"},"status":{"phase":"Running"}},
		{"metadata":{"name":"chaos-target-b","creationTimestamp":"` +
		time.Now().Add(-5*time.Second).UTC().Format(time.RFC3339) + `"},"status":{"phase":"Pending"}}
	]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path + "?" + r.URL.RawQuery
		gotAuth = r.Header.Get("Authorization")
		w.Write([]byte(body))
	}))
	defer srv.Close()

	pods, err := testClient(srv).ListPods(context.Background(), "app=chaos-target")
	if err != nil {
		t.Fatalf("ListPods: %v", err)
	}
	if !strings.Contains(gotPath, "/api/v1/namespaces/demo/pods") {
		t.Errorf("path = %q, want the demo pods collection", gotPath)
	}
	if !strings.Contains(gotPath, "labelSelector=app%3Dchaos-target") {
		t.Errorf("path = %q, want the label selector", gotPath)
	}
	if gotAuth != "Bearer test-token" {
		t.Errorf("auth = %q, want Bearer token", gotAuth)
	}
	if len(pods) != 2 || pods[0].Name != "chaos-target-a" || pods[0].Phase != "Running" {
		t.Fatalf("pods = %+v", pods)
	}
	if pods[0].AgeSeconds < 25 || pods[0].AgeSeconds > 40 {
		t.Errorf("age = %d, want ~30s", pods[0].AgeSeconds)
	}
}

func TestDeletePod(t *testing.T) {
	var gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.WriteHeader(200)
	}))
	defer srv.Close()

	if err := testClient(srv).DeletePod(context.Background(), "chaos-target-a"); err != nil {
		t.Fatalf("DeletePod: %v", err)
	}
	if gotMethod != http.MethodDelete {
		t.Errorf("method = %s, want DELETE", gotMethod)
	}
	if gotPath != "/api/v1/namespaces/demo/pods/chaos-target-a" {
		t.Errorf("path = %q", gotPath)
	}
}

func TestDeletePodRejectsTraversalNames(t *testing.T) {
	// a crafted name must be REJECTED client-side (never sent) — the real traversal defence, since a server
	// that decodes %2F + path-cleans could otherwise reach another namespace (RBAC is the 2nd line).
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(200)
	}))
	defer srv.Close()
	c := testClient(srv)
	for _, bad := range []string{"../../gipc/pods/core-abc", "a/b", "..", "Chaos-Target", "foo bar", "-lead"} {
		if err := c.DeletePod(context.Background(), bad); err == nil {
			t.Errorf("DeletePod(%q) = nil, want rejection", bad)
		}
	}
	if hit {
		t.Error("a rejected name reached the API server")
	}
	// a valid name is accepted
	if err := c.DeletePod(context.Background(), "chaos-target-abc123"); err != nil {
		t.Errorf("valid name rejected: %v", err)
	}
}

func TestDeletePodEmptyName(t *testing.T) {
	if err := testClient(httptest.NewServer(http.NotFoundHandler())).DeletePod(context.Background(), ""); err == nil {
		t.Error("want error on empty pod name")
	}
}

func TestNon2xxSurfacesMessageNotToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(403)
		w.Write([]byte(`{"kind":"Status","message":"pods is forbidden","reason":"Forbidden"}`))
	}))
	defer srv.Close()

	_, err := testClient(srv).ListPods(context.Background(), "app=chaos-target")
	if err == nil {
		t.Fatal("want error on 403")
	}
	if !strings.Contains(err.Error(), "forbidden") {
		t.Errorf("err = %v, want the k8s message", err)
	}
	if strings.Contains(err.Error(), "test-token") {
		t.Error("token leaked into the error")
	}
}

func TestNilClientDisabled(t *testing.T) {
	var c *Client // Lab disabled → New returns nil
	if _, err := c.ListPods(context.Background(), "x"); err != ErrDisabled {
		t.Errorf("ListPods on nil: %v, want ErrDisabled", err)
	}
	if err := c.DeletePod(context.Background(), "x"); err != ErrDisabled {
		t.Errorf("DeletePod on nil: %v, want ErrDisabled", err)
	}
}
