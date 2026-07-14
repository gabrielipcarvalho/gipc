package server

import (
	"net/http"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
)

// labRateLimitHandler exposes the REAL global limiter's aggregate state (rps/burst/activeBuckets/denied).
// No per-IP data — the visualizer + the client "hammer" (P6) show the real token bucket draining honestly.
func labRateLimitHandler(l *middleware.Limiter) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, l.Snapshot())
	}
}
