package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

func TestPublishLabEventNilSafe(t *testing.T) {
	publishLabEvent(nil, "chaos", "x") // must not panic
}

func TestPublishLabEventForwarded(t *testing.T) {
	h := newHub()
	sub := h.subscribe()
	defer h.unsubscribe(sub)
	publishLabEvent(h, "chaos", "killed chaos-target-a")
	select {
	case m := <-sub:
		if m.event != "lab" || !strings.Contains(string(m.data), `"kind":"chaos"`) || !strings.Contains(string(m.data), "killed chaos-target-a") {
			t.Errorf("event = %s data = %s", m.event, m.data)
		}
	case <-time.After(time.Second):
		t.Fatal("no event received")
	}
}

func TestLabEventsDisabled(t *testing.T) {
	rec := httptest.NewRecorder()
	labEventsHandler(newHub(), context.Background(), config.Config{LabEnabled: false})(rec, httptest.NewRequest("GET", "/api/lab/events", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rec.Code)
	}
}

func TestLabEventsHeartbeatAndForward(t *testing.T) {
	h := newHub()
	cfg := config.Config{LabEnabled: true, MaxStreams: 8, LabEventHeartbeat: 30 * time.Millisecond}
	rec := httptest.NewRecorder()
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "/api/lab/events", nil).WithContext(ctx)

	done := make(chan struct{})
	go func() { labEventsHandler(h, context.Background(), cfg)(rec, req); close(done) }()

	time.Sleep(20 * time.Millisecond) // immediate first heartbeat should be written
	publishLabEvent(h, "loadtest", "start c=5 s=3")
	time.Sleep(60 * time.Millisecond) // a heartbeat tick + the forwarded event
	cancel()                          // client "disconnects"
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return on ctx cancel")
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"kind":"heartbeat"`) {
		t.Error("expected an immediate heartbeat frame")
	}
	if !strings.Contains(body, `"kind":"loadtest"`) || !strings.Contains(body, "start c=5 s=3") {
		t.Error("expected the forwarded loadtest event")
	}
}
