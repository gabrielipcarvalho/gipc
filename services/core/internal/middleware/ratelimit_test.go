package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// newTestLimiter builds a limiter WITHOUT the background sweeper (deterministic tests).
func newTestLimiter(rps float64, burst int) *Limiter {
	return &Limiter{buckets: make(map[string]*bucket), rps: rps, burst: float64(burst), ttl: time.Minute}
}

func TestLimiterBurstThenDeny(t *testing.T) {
	l := newTestLimiter(1, 3)
	now := time.Now()
	for i := 0; i < 3; i++ {
		if !l.allow("1.1.1.1", now) {
			t.Fatalf("request %d within burst should be allowed", i+1)
		}
	}
	if l.allow("1.1.1.1", now) {
		t.Fatal("4th request at same instant should be denied (bucket empty)")
	}
	// after 2s at rps=1, ~2 tokens refill → allowed again
	if !l.allow("1.1.1.1", now.Add(2*time.Second)) {
		t.Fatal("request after refill should be allowed")
	}
}

func TestLimiterPerIPIsolated(t *testing.T) {
	l := newTestLimiter(1, 1)
	now := time.Now()
	if !l.allow("1.1.1.1", now) {
		t.Fatal("IP A first request allowed")
	}
	if l.allow("1.1.1.1", now) {
		t.Fatal("IP A second request denied (burst 1)")
	}
	if !l.allow("2.2.2.2", now) {
		t.Fatal("IP B must have its own bucket, not share A's")
	}
}

func TestMiddlewareReturns429(t *testing.T) {
	l := newTestLimiter(1, 1)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))

	req := httptest.NewRequest("GET", "/api/version", nil)
	req.Header.Set("CF-Connecting-IP", "9.9.9.9")

	rec1 := httptest.NewRecorder()
	h.ServeHTTP(rec1, req)
	if rec1.Code != http.StatusOK {
		t.Fatalf("first = %d, want 200", rec1.Code)
	}
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req)
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second = %d, want 429", rec2.Code)
	}
	if rec2.Header().Get("Retry-After") == "" {
		t.Fatal("429 should carry Retry-After")
	}
}

func TestClientIPPrefersCFHeader(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "10.0.0.1:5555"
	req.Header.Set("X-Forwarded-For", "3.3.3.3, 4.4.4.4")
	req.Header.Set("CF-Connecting-IP", "5.5.5.5")
	if got := ClientIP(req); got != "5.5.5.5" {
		t.Fatalf("ClientIP = %q, want CF-Connecting-IP 5.5.5.5", got)
	}
	req.Header.Del("CF-Connecting-IP")
	if got := ClientIP(req); got != "3.3.3.3" {
		t.Fatalf("ClientIP = %q, want leftmost XFF 3.3.3.3", got)
	}
	req.Header.Del("X-Forwarded-For")
	if got := ClientIP(req); got != "10.0.0.1" {
		t.Fatalf("ClientIP = %q, want RemoteAddr host 10.0.0.1", got)
	}
}

func TestDeniedCounterAndSnapshot(t *testing.T) {
	l := NewLimiter(0, 0) // always refuses (0 tokens, no refill)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	for i := 0; i < 3; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/version", nil)
		req.Header.Set("CF-Connecting-IP", "8.8.8.8")
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusTooManyRequests {
			t.Fatalf("want 429, got %d", rec.Code)
		}
	}
	s := l.Snapshot()
	if s.Denied < 3 {
		t.Errorf("denied = %d, want >=3", s.Denied)
	}
	if s.ActiveBuckets != 1 {
		t.Errorf("activeBuckets = %d, want 1", s.ActiveBuckets)
	}
	// aggregate-only: the snapshot must not embed any IP
	b, _ := json.Marshal(s)
	if strings.Contains(string(b), "8.8.8.8") {
		t.Error("snapshot leaked an IP")
	}
}
