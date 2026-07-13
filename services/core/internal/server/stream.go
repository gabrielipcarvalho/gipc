package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// streamHandler serves GET /api/stream as SSE — an `event: metrics` frame every cfg.StreamInterval.
//
// srvCtx is main's SIGTERM context: the loop selects on it so streams END PROMPTLY on shutdown.
// (http.Server.Shutdown WAITS for handlers to return — it does NOT cancel request contexts — so
// without this a viewer would block Shutdown the full budget → os.Exit(1).)
func streamHandler(prom *promql.Client, cfg config.Config, srvCtx context.Context, h *hub) http.HandlerFunc {
	var active atomic.Int64 // scoped to this handler → deterministic cap test, injectable via cfg
	maxStreams := int64(cfg.MaxStreams)
	interval := cfg.StreamInterval
	if interval <= 0 {
		interval = 5 * time.Second
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if active.Add(1) > maxStreams {
			active.Add(-1)
			http.Error(w, "too many streams", http.StatusServiceUnavailable)
			return
		}
		defer active.Add(-1)

		// subscribe AFTER the cap check so a rejected (503) stream can't leak a subscriber.
		sub := h.subscribe()
		defer h.unsubscribe(sub)

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no") // belt-and-suspenders vs proxy buffering

		rc := http.NewResponseController(w)

		// writeFrame writes one SSE frame; returns false when the client is gone. The rolling per-write
		// deadline defeats the 30s server WriteTimeout AND bounds each write so a stuck client errors out
		// (freeing its slot). Best-effort — the httptest recorder lacks it; a real conn has it via Unwrap.
		writeFrame := func(event string, data []byte) bool {
			_ = rc.SetWriteDeadline(time.Now().Add(interval + 5*time.Second))
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
				return false
			}
			return rc.Flush() == nil
		}
		// sendMetrics ALWAYS emits a metrics frame — incl. an "unavailable" Status (client → "—"); never a
		// bare ping substitute (that would keep the last real numbers rendered = stale-as-live).
		sendMetrics := func() bool {
			b, err := json.Marshal(computeStatus(r.Context(), prom)) // 3s timeout PER QUERY inside
			if err != nil {
				return true // skip one frame, keep the stream warm
			}
			return writeFrame("metrics", b)
		}

		if !sendMetrics() { // immediate first frame so the client paints without waiting an interval
			return
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if !sendMetrics() {
					return
				}
			case m := <-sub: // deploy event broadcast from the webhook
				if !writeFrame(m.event, m.data) {
					return
				}
			case <-r.Context().Done(): // client disconnected
				return
			case <-srvCtx.Done(): // server shutting down
				return
			}
		}
	}
}
