package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// Metric is one telemetry value. Value is nil when ok=false (query failed/empty) — the frontend
// then shows "—"/"unavailable" honestly; a placeholder number is NEVER emitted as real.
type Metric struct {
	Value *float64 `json:"value"`
	Unit  string   `json:"unit"`
	OK    bool     `json:"ok"`
}

// Status mirrors data/status.ts on the web side EXACTLY.
type Status struct {
	Source  string            `json:"source"` // "prometheus" | "unavailable"
	TS      string            `json:"ts"`
	Metrics map[string]Metric `json:"metrics"`
}

// The 5 metrics. Source = Caddy front-door histogram (handler="subroute" = all :80 site traffic,
// one count per request — verified label; excludes the :2019 self-scrape + the double-counting
// "headers" handler) + cAdvisor for the web pod. handler="subroute" also includes the ~0.15 req/s
// caddy-health probe baseline (no path label to exclude it) — honest "all site traffic".
var statusQueries = []struct{ key, unit, ql string }{
	{"reqPerSec", "req/s", `sum(rate(caddy_http_request_duration_seconds_count{handler="subroute"}[1m]))`},
	{"p99Ms", "ms", `histogram_quantile(0.99, sum(rate(caddy_http_request_duration_seconds_bucket{handler="subroute"}[5m])) by (le)) * 1000`},
	{"errorRate", "ratio", `sum(rate(caddy_http_request_duration_seconds_count{handler="subroute",code=~"5.."}[5m])) / clamp_min(sum(rate(caddy_http_request_duration_seconds_count{handler="subroute"}[5m])), 1)`},
	{"cpuCores", "cores", `sum(rate(container_cpu_usage_seconds_total{namespace="gipc",pod=~"web-.*",container="web"}[2m]))`},
	{"memMiB", "MiB", `sum(container_memory_working_set_bytes{namespace="gipc",pod=~"web-.*",container="web"}) / 1048576`},
}

// statusHandler runs the queries concurrently (each goroutine writes its OWN slice slot — no shared
// map race), bounded by the request context, and assembles a graceful partial Status.
func statusHandler(prom *promql.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type res struct {
			v  float64
			ok bool
		}
		results := make([]res, len(statusQueries))
		var wg sync.WaitGroup
		for i, q := range statusQueries {
			wg.Add(1)
			go func(i int, ql string) {
				defer wg.Done()
				ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
				defer cancel()
				v, ok, _ := prom.Query(ctx, ql)
				results[i] = res{v, ok}
			}(i, q.ql)
		}
		wg.Wait()

		metrics := make(map[string]Metric, len(statusQueries))
		anyOK := false
		for i, q := range statusQueries {
			m := Metric{Unit: q.unit, OK: results[i].ok}
			if results[i].ok {
				v := results[i].v
				m.Value = &v
				anyOK = true
			}
			metrics[q.key] = m
		}
		source := "prometheus"
		if !anyOK {
			source = "unavailable" // all queries failed → Prometheus unreachable; page shows honest fallback
		}
		writeJSON(w, http.StatusOK, Status{
			Source:  source,
			TS:      time.Now().UTC().Format(time.RFC3339),
			Metrics: metrics,
		})
	}
}
