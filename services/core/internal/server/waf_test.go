package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/waf"
)

// wafTestHandler wraps a trivial 200-handler with the WAF middleware (labHub nil — publishLabEvent is nil-safe).
func wafTestHandler(cfg config.Config, state *wafState) http.Handler {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return wafMiddleware(waf.NewEngine(), state, cfg, nil)(inner)
}

func TestWAFMonitorNeverBlocks(t *testing.T) {
	state := newWAFState(32)
	h := wafTestHandler(config.Config{WAFEnabled: true, WAFBlock: false}, state)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/x?f=../../etc/passwd", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("monitor mode must not block: code=%d", rec.Code)
	}
	if state.inspected.Load() != 1 || state.flagged.Load() != 1 || state.blocked.Load() != 0 {
		t.Fatalf("inspected=%d flagged=%d blocked=%d want 1/1/0", state.inspected.Load(), state.flagged.Load(), state.blocked.Load())
	}
}

// TestWAFExemptUnderBlock proves the EXEMPTION (not the monitor default) protects the load-bearing paths:
// run under WAFBlock=true with a block-eligible traversal signature in the query — exempt paths must be
// neither inspected, flagged, nor blocked.
func TestWAFExemptUnderBlock(t *testing.T) {
	cfg := config.Config{WAFEnabled: true, WAFBlock: true}
	for _, path := range []string{
		"/api/healthz", "/api/readyz", "/api/hooks/deploy",
		"/api/stream", "/api/lab/events", "/api/lab/loadtest",
		"/api/lab/waf", "/api/lab/waf/probe",
	} {
		state := newWAFState(32)
		h := wafTestHandler(cfg, state)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path+"?x=../../etc/passwd", nil))
		if rec.Code == http.StatusForbidden {
			t.Fatalf("exempt path %s was blocked", path)
		}
		if state.inspected.Load() != 0 || state.flagged.Load() != 0 {
			t.Fatalf("exempt path %s inspected=%d flagged=%d want 0/0", path, state.inspected.Load(), state.flagged.Load())
		}
	}
}

func TestWAFSoftBlock(t *testing.T) {
	cfg := config.Config{WAFEnabled: true, WAFBlock: true}
	// traversal is Block-eligible → 403
	st := newWAFState(32)
	rec := httptest.NewRecorder()
	wafTestHandler(cfg, st).ServeHTTP(rec, httptest.NewRequest("GET", "/api/x?f=../../etc/passwd", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("traversal under WAF_BLOCK must 403: code=%d", rec.Code)
	}
	if st.blocked.Load() != 1 {
		t.Fatalf("blocked=%d want 1", st.blocked.Load())
	}
	// sqli is monitor-only → flagged but NOT blocked even under WAF_BLOCK
	st2 := newWAFState(32)
	rec2 := httptest.NewRecorder()
	wafTestHandler(cfg, st2).ServeHTTP(rec2, httptest.NewRequest("GET", "/api/x?q=1+union+select+1", nil))
	if rec2.Code != http.StatusOK {
		t.Fatalf("sqli is monitor-only, must not block: code=%d", rec2.Code)
	}
	if st2.flagged.Load() != 1 || st2.blocked.Load() != 0 {
		t.Fatalf("sqli flagged=%d blocked=%d want 1/0", st2.flagged.Load(), st2.blocked.Load())
	}
}

func TestWAFSnapshotNoIPNoUA(t *testing.T) {
	state := newWAFState(32)
	h := wafTestHandler(config.Config{WAFEnabled: true}, state)
	req := httptest.NewRequest("GET", "/api/x?f=../../etc/passwd", nil)
	req.Header.Set("CF-Connecting-IP", "203.0.113.77")
	req.Header.Set("User-Agent", "sqlmap/1.5-SECRET-UA")
	req.RemoteAddr = "203.0.113.77:9999"
	h.ServeHTTP(httptest.NewRecorder(), req)
	b, _ := json.Marshal(state.Snapshot(0))
	s := string(b)
	if strings.Contains(s, "203.0.113.77") {
		t.Fatalf("snapshot leaked the client IP: %s", s)
	}
	if strings.Contains(s, "sqlmap") || strings.Contains(s, "SECRET-UA") {
		t.Fatalf("snapshot leaked the user-agent: %s", s)
	}
}

func TestWAFSnapshotJSONTags(t *testing.T) {
	b, _ := json.Marshal(newWAFState(4).Snapshot(3))
	s := string(b)
	for _, want := range []string{`"inspected"`, `"flagged"`, `"blocked"`, `"byCategory"`, `"recent"`, `"rateDenied"`} {
		if !strings.Contains(s, want) {
			t.Fatalf("snapshot missing %s: %s", want, s)
		}
	}
	if strings.Contains(s, `"ByCategory"`) || strings.Contains(s, `"RateDenied"`) {
		t.Fatalf("PascalCase field leaked (broken TS contract): %s", s)
	}
}

func TestWAFRingZeroNoPanic(t *testing.T) {
	t.Setenv("WAF_RING", "0")
	cfg, _ := config.Load()
	if cfg.WAFRing < 1 {
		t.Fatalf("WAFRing must be clamped >=1, got %d", cfg.WAFRing)
	}
	// a direct newWAFState(0) must also not panic on record (defensive internal floor)
	st := newWAFState(0)
	st.record("GET", "/x", []waf.Finding{{RuleID: "traversal", Category: waf.CatTraversal, Block: true}}, false)
	// and via the real handler a flagged request must not 500
	h, _ := New(cfg, discardLog(), context.Background())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/version?f=../../etc/passwd", nil))
	if rec.Code == http.StatusInternalServerError {
		t.Fatalf("flagged request panicked (500) with WAF_RING=0")
	}
}

func TestWAFAdversarialInputNoPanic(t *testing.T) {
	state := newWAFState(8)
	h := wafTestHandler(config.Config{WAFEnabled: true, WAFBlock: true}, state)
	for _, tg := range []string{
		"/api/x",
		"/api/x?q=" + strings.Repeat("A", 20000),
		"/api/x?f=%2e%2e%2f%2e%2e%2fetc%2fpasswd",
		"/api/x?q=" + strings.Repeat("%2e", 5000),
	} {
		wafTestHandler(config.Config{WAFEnabled: true}, newWAFState(8)).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", tg, nil))
	}
	// a malformed RawQuery (bare %, invalid escape) set directly — the engine's QueryUnescape must fall back, no panic
	req := httptest.NewRequest("GET", "/api/x", nil)
	req.URL.RawQuery = "q=%zz%" + strings.Repeat("A", 100)
	h.ServeHTTP(httptest.NewRecorder(), req)
}

func TestWAFDisabledPassThrough(t *testing.T) {
	state := newWAFState(8)
	h := wafTestHandler(config.Config{WAFEnabled: false, WAFBlock: true}, state)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/x?f=../../etc/passwd", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("kill switch: code=%d want 200", rec.Code)
	}
	if state.inspected.Load() != 0 {
		t.Fatalf("kill switch must not inspect: inspected=%d", state.inspected.Load())
	}
}

// TestWAFProbeDoesNotInflateCounters: an organic flagged request bumps the counter; a probe with the same
// signature does NOT (the probe route is exempt + the handler never touches wafState).
func TestWAFProbeDoesNotInflateCounters(t *testing.T) {
	t.Setenv("LAB_ENABLED", "true")
	cfg, _ := config.Load()
	h, _ := New(cfg, discardLog(), context.Background())
	snap := func() wafSnapshot {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/waf", nil))
		var s wafSnapshot
		_ = json.Unmarshal(rec.Body.Bytes(), &s)
		return s
	}
	// organic, non-exempt flagged request
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/version?f=../../etc/passwd", nil))
	if mid := snap(); mid.Flagged != 1 {
		t.Fatalf("organic flagged request: flagged=%d want 1", mid.Flagged)
	}
	// probe with the same signature must NOT bump the counter
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/waf/probe?sample="+url.QueryEscape("../../etc/passwd"), nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe code=%d", rec.Code)
	}
	if after := snap(); after.Flagged != 1 {
		t.Fatalf("probe inflated the live counter: flagged went to %d (want 1)", after.Flagged)
	}
}

func TestWAFProbeEchoesFindings(t *testing.T) {
	h := wafProbeHandler(config.Config{LabEnabled: true, WAFBlock: false}, waf.NewEngine())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/waf/probe?sample="+url.QueryEscape("../../etc/passwd"), nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d", rec.Code)
	}
	var resp struct {
		Findings    []waf.Finding `json:"findings"`
		MonitorOnly bool          `json:"monitorOnly"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Findings) == 0 || resp.Findings[0].Category != waf.CatTraversal || !resp.Findings[0].Block {
		t.Fatalf("expected a block-eligible traversal finding: %+v", resp.Findings)
	}
	if !resp.MonitorOnly {
		t.Fatal("monitorOnly should be true when WAFBlock=false")
	}
}

func TestWAFProbeLimiterWired(t *testing.T) {
	t.Setenv("WAF_PROBE_RPS", "0")
	t.Setenv("WAF_PROBE_BURST", "0")
	cfg, _ := config.Load()
	h, _ := New(cfg, discardLog(), context.Background())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/waf/probe?sample=x", nil))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("probe with zero-token limiter: code=%d want 429", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/version", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/version must not ride the probe limiter: code=%d", rec.Code)
	}
}

func TestWAFProbeAndStatsDisabled503(t *testing.T) {
	if rec := httptest.NewRecorder(); true {
		wafProbeHandler(config.Config{LabEnabled: false}, waf.NewEngine()).ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/waf/probe?sample=x", nil))
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("probe disabled: code=%d want 503", rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	wafStatsHandler(config.Config{LabEnabled: false}, newWAFState(4), middleware.NewLimiter(1, 1)).ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/waf", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("stats disabled: code=%d want 503", rec.Code)
	}
}
