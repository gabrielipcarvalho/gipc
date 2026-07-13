package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
}

func TestCORSRejectsForeignOrigin(t *testing.T) {
	h := CORS("https://gipc.dev")(okHandler())
	req := httptest.NewRequest("GET", "/api/version", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign origin = %d, want 403", rec.Code)
	}
}

func TestCORSAllowsMatchingOrigin(t *testing.T) {
	h := CORS("https://gipc.dev")(okHandler())
	req := httptest.NewRequest("GET", "/api/version", nil)
	req.Header.Set("Origin", "https://gipc.dev")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("matching origin = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://gipc.dev" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want https://gipc.dev", got)
	}
}

func TestCORSNoOriginPasses(t *testing.T) {
	h := CORS("https://gipc.dev")(okHandler())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/version", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("no origin = %d, want 200 (same-origin/server-side/curl)", rec.Code)
	}
}

func TestCORSPreflight(t *testing.T) {
	h := CORS("https://gipc.dev")(okHandler())
	req := httptest.NewRequest("OPTIONS", "/api/version", nil)
	req.Header.Set("Origin", "https://gipc.dev")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight = %d, want 204", rec.Code)
	}
}
