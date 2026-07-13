// Package server wires the core HTTP routes and middleware.
package server

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
)

// Version is stamped at build time via -ldflags "-X ...server.Version=<sha>"; "dev" otherwise.
var Version = "dev"

// New builds the core HTTP handler. Health/readyz are wrapped by ONLY the base chain
// (recover + request-id) — never the rate limiter or access log, so kubelet probes can't be
// throttled into a CrashLoop or spam the logs. All other /api/* routes get the full chain.
func New(cfg config.Config, log *slog.Logger) http.Handler {
	limiter := middleware.NewLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", healthz)
	mux.HandleFunc("GET /api/readyz", readyz)
	mux.HandleFunc("GET /api/version", version)
	// (P3 adds GET /api/status; P4 /api/stream; P5 POST /api/hooks/deploy; P7 /api/uptime)

	// One mux → correct 404 (unknown path) / 405 (wrong method). Logging + rate-limit skip
	// /api/healthz|readyz internally (middleware.IsHealthPath), so kubelet probes are never
	// throttled into a CrashLoop or spammed to the log — without a catch-all that breaks 405.
	return middleware.Chain(
		middleware.Recover(log),
		middleware.RequestIDMiddleware,
		middleware.Logging(log),
		middleware.CORS(cfg.CORSOrigin),
		limiter.Middleware,
	)(mux)
}

func healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readyz is trivially ready in P2; P3 will check Prometheus reachability.
func readyz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func version(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"service": "gipc-core", "version": Version})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
