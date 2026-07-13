// Package server wires the core HTTP routes and middleware.
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// Version is stamped at build time via -ldflags "-X ...server.Version=<sha>"; "dev" otherwise.
var Version = "dev"

// New builds the core HTTP handler. Health/readyz are wrapped by ONLY the base chain
// (recover + request-id) — never the rate limiter or access log, so kubelet probes can't be
// throttled into a CrashLoop or spam the logs. All other /api/* routes get the full chain.
// New builds the core handler. srvCtx (main's SIGTERM context) lets long-lived handlers (SSE) end on
// shutdown so http.Server.Shutdown drains cleanly.
func New(cfg config.Config, log *slog.Logger, srvCtx context.Context) http.Handler {
	limiter := middleware.NewLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst)

	prom := promql.New(cfg.PrometheusURL)
	hub := newHub()
	deploys := newDeployStore()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", healthz)
	mux.HandleFunc("GET /api/readyz", readyz)
	mux.HandleFunc("GET /api/version", version)
	mux.HandleFunc("GET /api/status", statusHandler(prom))                   // real metrics (never hard-fails)
	mux.HandleFunc("GET /api/stream", streamHandler(prom, cfg, srvCtx, hub)) // SSE metric ticks + deploy events
	mux.HandleFunc("POST /api/hooks/deploy", deployHookHandler([]byte(cfg.DeployHookKey), deploys, hub))
	mux.HandleFunc("GET /api/deploys", deploysHandler(deploys))
	// (P7 /api/uptime)

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

// readyz stays Prometheus-INDEPENDENT by design. Gating it on Prometheus would 503 this single-replica
// pod on any Prometheus blip → the core Service loses its endpoint → Caddy 502s ALL /api/* (incl.
// /api/status). Prometheus reachability is surfaced via /api/status's `source` field, never readiness.
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
