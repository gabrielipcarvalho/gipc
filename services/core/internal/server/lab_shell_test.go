package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

func TestLabShellDisabled503(t *testing.T) {
	h := labShellHandler(config.Config{LabEnabled: false})
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("POST", "/api/lab/shell", strings.NewReader(`{"cmd":"help","cwd":"/"}`)))
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("disabled → %d; want 503", w.Code)
	}
}

func TestLabShellValid200(t *testing.T) {
	h := labShellHandler(config.Config{LabEnabled: true})
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("POST", "/api/lab/shell", strings.NewReader(`{"cmd":"whoami","cwd":"/"}`)))
	if w.Code != http.StatusOK {
		t.Fatalf("valid → %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "visitor@gipc.dev") {
		t.Errorf("body %q", w.Body.String())
	}
}

func TestLabShellUnknownIsNotExec(t *testing.T) {
	h := labShellHandler(config.Config{LabEnabled: true})
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("POST", "/api/lab/shell", strings.NewReader(`{"cmd":"rm -rf /","cwd":"/"}`)))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "command not found: rm") {
		t.Errorf("→ %d %q", w.Code, w.Body.String())
	}
}

func TestLabShellOversizeBody400(t *testing.T) {
	// a multi-KB body is rejected by MaxBytesReader BEFORE the decoder buffers it all.
	h := labShellHandler(config.Config{LabEnabled: true})
	body := `{"cmd":"` + strings.Repeat("x", 5000) + `","cwd":"/"}`
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("POST", "/api/lab/shell", strings.NewReader(body)))
	if w.Code != http.StatusBadRequest {
		t.Errorf("oversize body → %d; want 400", w.Code)
	}
}

func TestLabShellLongCmd400(t *testing.T) {
	// within the 2KB body cap but the cmd itself exceeds 256 → post-decode 400.
	h := labShellHandler(config.Config{LabEnabled: true})
	body := `{"cmd":"` + strings.Repeat("a", 300) + `","cwd":"/"}`
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("POST", "/api/lab/shell", strings.NewReader(body)))
	if w.Code != http.StatusBadRequest {
		t.Errorf("long cmd → %d; want 400", w.Code)
	}
}

func TestLabShellLongCwd400(t *testing.T) {
	// cwd exceeds 512 (within the 2KB body cap) → post-decode 400.
	h := labShellHandler(config.Config{LabEnabled: true})
	body := `{"cmd":"pwd","cwd":"/` + strings.Repeat("a", 600) + `"}`
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("POST", "/api/lab/shell", strings.NewReader(body)))
	if w.Code != http.StatusBadRequest {
		t.Errorf("long cwd → %d; want 400", w.Code)
	}
}
