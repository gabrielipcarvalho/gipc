package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

func TestHistogramPercentiles(t *testing.T) {
	h := newHistogram()
	// 100 records: 90 at ~4ms (bucket edge 5), 9 at ~40ms (edge 50), 1 at ~800ms (edge 1000)
	for i := 0; i < 90; i++ {
		h.record(4, true)
	}
	for i := 0; i < 9; i++ {
		h.record(40, true)
	}
	h.record(800, false)

	s := h.snapshot(2 * time.Second)
	if s.Total != 100 || s.Errors != 1 {
		t.Fatalf("total/errors = %d/%d, want 100/1", s.Total, s.Errors)
	}
	if s.P50 != 5 {
		t.Errorf("p50 = %v, want 5 (the 4ms bucket edge)", s.P50)
	}
	if s.P95 != 50 {
		t.Errorf("p95 = %v, want 50", s.P95)
	}
	if s.P99 != 50 {
		t.Errorf("p99 = %v, want 50", s.P99)
	}
	if s.RPS != 50 { // 100 / 2s
		t.Errorf("rps = %v, want 50", s.RPS)
	}
}

func TestHistogramEmpty(t *testing.T) {
	s := newHistogram().snapshot(0)
	if s.Total != 0 || s.P50 != 0 || s.P99 != 0 || s.RPS != 0 {
		t.Errorf("empty snapshot should be all-zero, got %+v", s)
	}
}

func TestRunLoadBoundedByCtx(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer target.Close()
	h := newHistogram()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() { runLoad(ctx, target.URL, 4, h); close(done) }()
	select {
	case <-done: // workers exited promptly on ctx cancel
	case <-time.After(2 * time.Second):
		t.Fatal("runLoad did not exit within 2s of ctx cancel — goroutine leak")
	}
	if s := h.snapshot(60 * time.Millisecond); s.Total == 0 {
		t.Error("expected some requests recorded")
	}
}

func TestClampAndParse(t *testing.T) {
	cases := []struct{ in, lo, hi, want int }{{999, 1, 50, 50}, {0, 1, 50, 1}, {-5, 1, 50, 1}, {20, 1, 50, 20}}
	for _, c := range cases {
		if got := clamp(c.in, c.lo, c.hi); got != c.want {
			t.Errorf("clamp(%d,%d,%d) = %d, want %d", c.in, c.lo, c.hi, got, c.want)
		}
	}
	if atoiOr("abc", 0) != 0 || atoiOr("7", 0) != 7 {
		t.Error("atoiOr wrong")
	}
}

func TestConfigCapsCodeClamped(t *testing.T) {
	t.Setenv("LOAD_MAX_CONCURRENCY", "5000")
	t.Setenv("LOAD_MAX_SECONDS", "9999")
	t.Setenv("LOAD_MAX_RUNS", "0")
	cfg, _ := config.Load()
	if cfg.LoadMaxConcurrency != 50 {
		t.Errorf("concurrency cap = %d, want code-clamped 50", cfg.LoadMaxConcurrency)
	}
	if cfg.LoadMaxSeconds != 10 {
		t.Errorf("seconds cap = %d, want 10", cfg.LoadMaxSeconds)
	}
	if cfg.LoadMaxRuns != 1 { // 0 → floored to 1
		t.Errorf("runs cap = %d, want floor 1", cfg.LoadMaxRuns)
	}
}

func TestLoadTestNoGoroutineLeak(t *testing.T) {
	// each completed run must NOT leave a parked goroutine (the srvCtx watcher used to leak per request).
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer target.Close()
	cfg := config.Config{LabEnabled: true, LoadTargetURL: target.URL, LoadMaxConcurrency: 2, LoadMaxSeconds: 10, LoadMaxRuns: 4}
	h := loadTestHandler(cfg, context.Background(), nil) // Background never cancels → a parked watcher would leak

	time.Sleep(50 * time.Millisecond)
	runtime.GC()
	before := runtime.NumGoroutine()
	for i := 0; i < 3; i++ {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/lab/loadtest?c=2&s=1", nil)
		r.Header.Set("CF-Connecting-IP", "1.2.3.4")
		h(rec, r) // blocks ~1s per run
	}
	time.Sleep(100 * time.Millisecond)
	runtime.GC()
	after := runtime.NumGoroutine()
	if after > before+2 { // small slack for httptest/transport churn
		t.Errorf("goroutine leak: before=%d after=%d (3 runs left %d parked)", before, after, after-before)
	}
}

func TestLoadTestDisabled(t *testing.T) {
	h := loadTestHandler(config.Config{LabEnabled: false}, context.Background(), nil)
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest("GET", "/api/lab/loadtest", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rec.Code)
	}
}

func TestLoadTestSingleFlightAndSSE(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer target.Close()
	cfg := config.Config{LabEnabled: true, LoadTargetURL: target.URL, LoadMaxConcurrency: 4, LoadMaxSeconds: 10, LoadMaxRuns: 4}
	h := loadTestHandler(cfg, context.Background(), nil)

	req := func() *http.Request {
		r := httptest.NewRequest("GET", "/api/lab/loadtest?c=2&s=1", nil)
		r.Header.Set("CF-Connecting-IP", "9.9.9.9")
		return r
	}

	rec1 := httptest.NewRecorder()
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); h(rec1, req()) }() // runs ~1s

	// give the first run time to store its single-flight key, then a same-IP request must 409
	time.Sleep(120 * time.Millisecond)
	rec2 := httptest.NewRecorder()
	h(rec2, req())
	if rec2.Code != http.StatusConflict {
		t.Errorf("2nd concurrent same-IP run = %d, want 409", rec2.Code)
	}

	wg.Wait() // first run completes (~1s)
	body := rec1.Body.String()
	if !strings.Contains(body, "event: histogram") {
		t.Error("expected histogram frames in the SSE body")
	}
	if !strings.Contains(body, "event: done") {
		t.Error("expected a done frame")
	}
	// after the first run finished, its IP key is freed → a new run is allowed
	rec3 := httptest.NewRecorder()
	r3 := httptest.NewRequest("GET", "/api/lab/loadtest?c=1&s=1", nil)
	r3.Header.Set("CF-Connecting-IP", "9.9.9.9")
	h(rec3, r3)
	if rec3.Code == http.StatusConflict {
		t.Error("IP key not released after the run finished")
	}
}
