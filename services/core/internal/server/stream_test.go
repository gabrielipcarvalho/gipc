package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

func fakeProm(t *testing.T) *promql.Client {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[{"value":[1,"1"]}]}}`))
	}))
	t.Cleanup(ts.Close)
	return promql.New(ts.URL)
}

// The stream writes an event: metrics frame and returns promptly on client (context) cancel.
func TestStreamFrameAndCancel(t *testing.T) {
	cfg := config.Config{StreamInterval: 10 * time.Millisecond, MaxStreams: 8}
	h := streamHandler(fakeProm(t), cfg, context.Background(), newHub())

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "/api/stream", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() { h(rec, req); close(done) }()
	time.Sleep(50 * time.Millisecond) // allow ≥1 frame
	cancel()                          // client disconnect
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return after context cancel")
	}

	if ct := rec.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("Content-Type=%q, want text/event-stream", ct)
	}
	if !strings.Contains(rec.Body.String(), "event: metrics\ndata: {") {
		t.Fatalf("no metrics frame written: %q", rec.Body.String())
	}
}

// A 2nd concurrent stream past MaxStreams → 503 (deterministic via closure-scoped counter + cfg cap).
func TestStreamCap(t *testing.T) {
	cfg := config.Config{StreamInterval: time.Second, MaxStreams: 1}
	h := streamHandler(fakeProm(t), cfg, context.Background(), newHub())

	ctx1, cancel1 := context.WithCancel(context.Background())
	defer cancel1()
	go h(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/stream", nil).WithContext(ctx1))
	time.Sleep(30 * time.Millisecond) // let #1 increment the active counter

	rec2 := httptest.NewRecorder()
	h(rec2, httptest.NewRequest("GET", "/api/stream", nil))
	if rec2.Code != http.StatusServiceUnavailable {
		t.Fatalf("2nd concurrent stream = %d, want 503", rec2.Code)
	}
}
