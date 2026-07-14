// Package server wires the core HTTP routes and middleware.
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/k8s"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/loki"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// Version is stamped at build time via -ldflags "-X ...server.Version=<sha>"; "dev" otherwise.
var Version = "dev"

// New builds the core HTTP handler. Health/readyz are wrapped by ONLY the base chain
// (recover + request-id) — never the rate limiter or access log, so kubelet probes can't be
// throttled into a CrashLoop or spam the logs. All other /api/* routes get the full chain.
// New builds the core handler and the uptime monitor. srvCtx (main's SIGTERM context) lets long-lived
// handlers (SSE) end on shutdown so http.Server.Shutdown drains cleanly. The returned *uptimeMonitor is
// built (not started) here — main.go calls mon.Run(ctx) so handler-only test builds don't spawn its loop.
func New(cfg config.Config, log *slog.Logger, srvCtx context.Context) (http.Handler, *uptimeMonitor) {
	limiter := middleware.NewLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst)

	prom := promql.New(cfg.PrometheusURL)
	lk := loki.New(cfg.LokiURL)
	hub := newHub()
	deploys := newDeployStore()
	uptime := newUptimeMonitor(cfg)

	// M5 Lab — the k8s client (nil when disabled/uninit'd → lab handlers 503). Build as an untyped-nil
	// interface so the `killer == nil` guard fires (a nil *k8s.Client in an interface is a typed-nil).
	k8sc, err := k8s.New(cfg)
	if err != nil {
		log.Warn("lab k8s client init failed — chaos disabled", "err", err)
		k8sc = nil
	}
	var killer podKiller
	if k8sc != nil {
		killer = k8sc
	}
	chaosLimiter := middleware.NewLimiter(cfg.ChaosRPS, cfg.ChaosBurst) // per-IP cooldown ≈ 1 kill / 10s

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/healthz", healthz)
	mux.HandleFunc("GET /api/readyz", readyz)
	mux.HandleFunc("GET /api/version", version)
	mux.HandleFunc("GET /api/status", statusHandler(prom))                   // real metrics (never hard-fails)
	mux.HandleFunc("GET /api/stream", streamHandler(prom, cfg, srvCtx, hub)) // SSE metric ticks + deploy events
	mux.HandleFunc("POST /api/hooks/deploy", deployHookHandler([]byte(cfg.DeployHookKey), deploys, hub))
	mux.HandleFunc("GET /api/deploys", deploysHandler(deploys))
	mux.HandleFunc("GET /api/metrics/history", historyHandler(prom)) // aggregate range series (Grafana-on-display)
	mux.HandleFunc("GET /api/logs", logsHandler(lk))                 // fixed+redacted log surface (Loki-on-display)
	mux.HandleFunc("GET /api/trace", traceHandler())                 // per-visitor real request path
	mux.HandleFunc("GET /api/uptime", uptimeHandler(uptime))         // probe/incident history (loop started in main)
	// M5 Lab — chaos: kill is cooldown-limited per IP; status is a plain read.
	mux.Handle("POST /api/lab/chaos", chaosLimiter.Middleware(http.HandlerFunc(chaosKillHandler(killer, cfg, log))))
	mux.HandleFunc("GET /api/lab/chaos/status", chaosStatusHandler(prom, killer, cfg))

	// One mux → correct 404 (unknown path) / 405 (wrong method). Logging + rate-limit skip
	// /api/healthz|readyz internally (middleware.IsHealthPath), so kubelet probes are never
	// throttled into a CrashLoop or spammed to the log — without a catch-all that breaks 405.
	handler := middleware.Chain(
		middleware.Recover(log),
		middleware.RequestIDMiddleware,
		middleware.Logging(log),
		middleware.CORS(cfg.CORSOrigin),
		limiter.Middleware,
	)(mux)
	return handler, uptime
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
