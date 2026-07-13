package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

func testHandler() http.Handler {
	cfg, _ := config.Load()
	return New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func do(t *testing.T, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	testHandler().ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func TestHealthz(t *testing.T) {
	if got := do(t, "GET", "/api/healthz").Code; got != http.StatusOK {
		t.Fatalf("GET /api/healthz = %d, want 200", got)
	}
}

func TestReadyz(t *testing.T) {
	if got := do(t, "GET", "/api/readyz").Code; got != http.StatusOK {
		t.Fatalf("GET /api/readyz = %d, want 200", got)
	}
}

func TestVersion(t *testing.T) {
	rec := do(t, "GET", "/api/version")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/version = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "gipc-core") {
		t.Fatalf("version body missing service name: %s", rec.Body.String())
	}
}

func TestUnknownRoute404(t *testing.T) {
	if got := do(t, "GET", "/api/does-not-exist").Code; got != http.StatusNotFound {
		t.Fatalf("unknown route = %d, want 404", got)
	}
}

func TestMethodMismatch405(t *testing.T) {
	if got := do(t, "POST", "/api/healthz").Code; got != http.StatusMethodNotAllowed {
		t.Fatalf("POST /api/healthz = %d, want 405", got)
	}
}
