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

	api := http.NewServeMux()
	api.HandleFunc("GET /api/version", version)
	// (P3 adds GET /api/status; P4 /api/stream; P5 POST /api/hooks/deploy; P7 /api/uptime)

	apiChain := middleware.Chain(
		middleware.Logging(log),
		middleware.CORS(cfg.CORSOrigin),
		limiter.Middleware,
	)

	root := http.NewServeMux()
	root.HandleFunc("GET /api/healthz", healthz) // base chain only
	root.HandleFunc("GET /api/readyz", readyz)   // base chain only
	root.Handle("/", apiChain(api))              // everything else: full chain

	base := middleware.Chain(middleware.Recover(log), middleware.RequestIDMiddleware)
	return base(root)
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
