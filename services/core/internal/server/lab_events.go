package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

// LabEvent is one entry on the lab event stream (JSON; mirrored in apps/web data/lab.ts).
type LabEvent struct {
	Kind   string `json:"kind"`   // chaos | loadtest | db | heartbeat
	TS     string `json:"ts"`     // RFC3339
	Detail string `json:"detail"` // human-readable — pod name / load params, NEVER an IP or secret
}

// publishLabEvent broadcasts a lab event to the labHub. Nil-safe (tests may pass a nil hub) + best-effort
// (the hub drops on a full subscriber, never blocks the producer).
func publishLabEvent(h *hub, kind, detail string) {
	if h == nil {
		return
	}
	if b, err := json.Marshal(LabEvent{Kind: kind, TS: time.Now().UTC().Format(time.RFC3339), Detail: detail}); err == nil {
		h.publish(sseMsg{event: "lab", data: b})
	}
}

// labEventsHandler streams lab lifecycle events (real chaos/loadtest signals + a heartbeat) over SSE.
func labEventsHandler(h *hub, srvCtx context.Context, cfg config.Config) http.HandlerFunc {
	var active atomic.Int64
	maxStreams := int64(cfg.MaxStreams)
	beat := cfg.LabEventHeartbeat
	if beat <= 0 {
		beat = 10 * time.Second
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if !cfg.LabEnabled {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		if active.Add(1) > maxStreams {
			active.Add(-1)
			http.Error(w, "too many streams", http.StatusServiceUnavailable)
			return
		}
		defer active.Add(-1)

		sub := h.subscribe()
		defer h.unsubscribe(sub)

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		rc := http.NewResponseController(w)
		writeFrame := func(event string, data []byte) bool {
			_ = rc.SetWriteDeadline(time.Now().Add(beat + 5*time.Second))
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
				return false
			}
			return rc.Flush() == nil
		}
		heartbeat := func() bool {
			b, _ := json.Marshal(LabEvent{Kind: "heartbeat", TS: time.Now().UTC().Format(time.RFC3339)})
			return writeFrame("lab", b)
		}

		if !heartbeat() { // immediate first frame → instant paint
			return
		}
		ticker := time.NewTicker(beat)
		defer ticker.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-srvCtx.Done():
				return
			case msg, ok := <-sub:
				if !ok || !writeFrame(msg.event, msg.data) {
					return
				}
			case <-ticker.C:
				if !heartbeat() {
					return
				}
			}
		}
	}
}
