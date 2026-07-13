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
func streamHandler(prom *promql.Client, cfg config.Config, srvCtx context.Context) http.HandlerFunc {
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

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no") // belt-and-suspenders vs proxy buffering

		rc := http.NewResponseController(w)

		// send one frame; returns false when the client is gone (stop the stream).
		send := func() bool {
			// Rolling per-write deadline: defeats the 30s server WriteTimeout AND bounds each write so a
			// stuck client errors out (freeing its slot) instead of blocking forever. Best-effort — the
			// httptest recorder doesn't support it; a real conn does (via statusRecorder.Unwrap).
			_ = rc.SetWriteDeadline(time.Now().Add(interval + 5*time.Second))
			// computeStatus applies a 3s timeout PER QUERY internally; pass the request ctx directly.
			st := computeStatus(r.Context(), prom)
			b, err := json.Marshal(st)
			if err != nil {
				return true // skip this frame, keep the stream warm
			}
			// ALWAYS emit the frame — incl. an "unavailable" Status (client → "—"). Never a bare ping
			// substitute (that would keep the last real numbers rendered = stale-as-live).
			if _, err := fmt.Fprintf(w, "event: metrics\ndata: %s\n\n", b); err != nil {
				return false
			}
			return rc.Flush() == nil
		}

		if !send() { // immediate first frame so the client paints without waiting an interval
			return
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if !send() {
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
