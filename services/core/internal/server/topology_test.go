package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/k8s"
)

type fakeLister struct {
	mu     sync.Mutex
	pods   map[string][]k8s.Pod // key: ns+"/"+selector
	failNS string               // guarded — leftover fan-out goroutines still read it after an early 503
	calls  atomic.Int64
}

var errBoom = errors.New("boom")

func (f *fakeLister) setFailNS(ns string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failNS = ns
}

func (f *fakeLister) ListPodsNS(_ context.Context, ns, selector string) ([]k8s.Pod, error) {
	f.calls.Add(1)
	f.mu.Lock()
	fail := f.failNS
	f.mu.Unlock()
	if ns == fail {
		return nil, errBoom
	}
	return f.pods[ns+"/"+selector], nil
}

func allUpLister() *fakeLister {
	pods := map[string][]k8s.Pod{}
	for _, svc := range serviceTable {
		pods[svc.ns+"/"+svc.selector] = []k8s.Pod{{
			Name: svc.name + "-abc", Phase: "Running", Ready: true, Restarts: 0,
			Image: "ghcr.io/gabrielipcarvalho/gipc-" + svc.name + ":" + hex40, AgeSeconds: 100,
			Requests: "cpu 100m · mem 128Mi", Limits: "cpu 500m · mem 256Mi",
		}}
	}
	return &fakeLister{pods: pods}
}

const hex40 = "36777b41be4acdea5c047d4c8090901603c3f936"

func getTopo(t *testing.T, fl podLister, cache *topoCache) (int, topology) {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/topology", nil)
	topologyHandler(fl, cache)(rec, req)
	var out topology
	if rec.Code == 200 {
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode: %v", err)
		}
	}
	return rec.Code, out
}

func TestTopologyHappyAllUp(t *testing.T) {
	code, out := getTopo(t, allUpLister(), &topoCache{})
	if code != 200 {
		t.Fatalf("code=%d", code)
	}
	if len(out.Services) != len(serviceTable) {
		t.Fatalf("services=%d want %d", len(out.Services), len(serviceTable))
	}
	for _, s := range out.Services {
		if s.Status != "up" {
			t.Errorf("%s status=%s want up", s.Name, s.Status)
		}
	}
	p := out.Services[0].Pods[0]
	if p.ImageShort != hex40[:7] {
		t.Errorf("imageShort=%q", p.ImageShort)
	}
	if p.CommitURL == "" {
		t.Errorf("own-repo 40-hex image should carry a commit url")
	}
	if p.Requests == "" || p.Limits == "" {
		t.Errorf("requests/limits missing")
	}
}

func TestTopologyDerivations(t *testing.T) {
	mk := func(ready ...bool) []topoPod {
		out := make([]topoPod, len(ready))
		for i, r := range ready {
			out[i] = topoPod{Phase: "Running", Ready: r}
		}
		return out
	}
	cases := []struct {
		pods []topoPod
		want string
	}{
		{mk(true, true), "up"},
		{mk(true, false), "degraded"},
		{mk(false, false), "down"},
		{nil, "down"},
		{[]topoPod{{Phase: "Failed", Ready: false}, {Phase: "Running", Ready: true}}, "up"}, // evicted excluded
		{[]topoPod{{Phase: "Succeeded", Ready: false}}, "down"},                             // only completed → down
		{[]topoPod{{Phase: "Pending", Ready: false}}, "down"},                               // pending, no statuses
	}
	for i, c := range cases {
		got, _ := deriveStatus(c.pods)
		if got != c.want {
			t.Errorf("case %d: got %s want %s", i, got, c.want)
		}
	}
}

func TestTopologyOneNamespaceFails503NotCached(t *testing.T) {
	fl := allUpLister()
	fl.setFailNS("observability")
	cache := &topoCache{}
	code, _ := getTopo(t, fl, cache)
	if code != 503 {
		t.Fatalf("code=%d want 503", code)
	}
	if cache.payload != nil {
		t.Fatal("failure must not be cached")
	}
	// recovery: same cache, lister healed → 200
	fl.setFailNS("")
	code, _ = getTopo(t, fl, cache)
	if code != 200 {
		t.Fatalf("recovery code=%d", code)
	}
}

func TestTopologyNilLister503(t *testing.T) {
	code, _ := getTopo(t, nil, &topoCache{})
	if code != 503 {
		t.Fatalf("code=%d want 503", code)
	}
}

func TestTopologyCacheSingleUpstreamHit(t *testing.T) {
	fl := allUpLister()
	cache := &topoCache{}
	getTopo(t, fl, cache)
	first := fl.calls.Load()
	getTopo(t, fl, cache) // within TTL — must not refetch
	if fl.calls.Load() != first {
		t.Fatalf("cache miss: calls %d → %d", first, fl.calls.Load())
	}
}

func TestToTopoPodUpstreamImageNoCommitLink(t *testing.T) {
	p := toTopoPod(k8s.Pod{Name: "x", Image: "ollama/ollama:0.12.6"})
	if p.CommitURL != "" {
		t.Fatal("upstream image must not link a commit")
	}
	if p.ImageShort != "0.12.6" {
		t.Fatalf("imageShort=%q", p.ImageShort)
	}
}
