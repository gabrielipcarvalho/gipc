package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// History is the metrics-history surface (Grafana-on-display): a few aggregate range series for
// native arcane sparklines. Only sum(...) series → no per-series/internal labels leak.
type History struct {
	Source string                   `json:"source"` // "prometheus" | "unavailable"
	TS     string                   `json:"ts"`
	Series map[string][]promql.Point `json:"series"`
}

// Selectors MIRROR status.go EXACTLY (avoids the reachable-but-empty label-mismatch failure).
var historyQueries = []struct{ key, ql string }{
	{"reqPerSec", `sum(rate(caddy_http_request_duration_seconds_count{handler="subroute"}[1m]))`},
	{"cpuCores", `sum(rate(container_cpu_usage_seconds_total{namespace="gipc",pod=~"web-.*",container="web"}[2m]))`},
	{"memMiB", `sum(container_memory_working_set_bytes{namespace="gipc",pod=~"web-.*",container="web"}) / 1048576`},
}

const (
	historyWindow = 30 * time.Minute
	historyStep   = 30 * time.Second
)

// computeHistory runs the range queries concurrently (each goroutine writes its OWN slice slot), each
// bounded by a per-query timeout, and assembles a graceful partial History (a failed series → empty).
func computeHistory(ctx context.Context, prom *promql.Client) History {
	end := time.Now()
	start := end.Add(-historyWindow)
	series := make([][]promql.Point, len(historyQueries))
	oks := make([]bool, len(historyQueries))
	var wg sync.WaitGroup
	for i, q := range historyQueries {
		wg.Add(1)
		go func(i int, ql string) {
			defer wg.Done()
			qctx, cancel := context.WithTimeout(ctx, 4*time.Second)
			defer cancel()
			pts, ok, _ := prom.Range(qctx, ql, start, end, historyStep)
			series[i] = pts
			oks[i] = ok
		}(i, q.ql)
	}
	wg.Wait()

	out := make(map[string][]promql.Point, len(historyQueries))
	anyOK := false
	for i, q := range historyQueries {
		if series[i] == nil {
			out[q.key] = []promql.Point{} // never null → the frontend maps cleanly
		} else {
			out[q.key] = series[i]
		}
		if oks[i] {
			anyOK = true
		}
	}
	source := "prometheus"
	if !anyOK {
		source = "unavailable"
	}
	return History{Source: source, TS: end.UTC().Format(time.RFC3339), Series: out}
}

// historyHandler ignores r.URL.Query() — the queries are fixed server-side (no client PromQL).
func historyHandler(prom *promql.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, computeHistory(r.Context(), prom))
	}
}
