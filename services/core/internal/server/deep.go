package server

// /api/metrics/deep — the observability deep-dive ("Grafana on display"). Every panel carries the
// REAL query it runs: the query is the exhibit, so panels are ALWAYS present (a failed/empty query
// renders with series: [] and its query text — never omitted). Queries are FIXED server-side; the
// endpoint takes no parameters. Label projection: the wire label derives ONLY from Labels["pod"]
// (matrix panels) or a fixed server-side name — raw Prometheus label maps (which carry instance=
// LAN IPs) are never marshalled. demo ns is deliberately excluded from the matchers (leftover test
// pods would pollute the exhibit; chaos effects are visible on the topology section instead).

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// rangeMatrixer is the narrow test seam (the podLister pattern).
type rangeMatrixer interface {
	RangeMatrix(ctx context.Context, q string, start, end time.Time, step time.Duration) ([]promql.Series, bool, error)
}

type deepSeries struct {
	Label  string         `json:"label"`
	Query  string         `json:"query,omitempty"` // per-series real query (the ladder/net panels)
	Points []promql.Point `json:"points"`
}

type deepPanel struct {
	Key     string       `json:"key"`
	Title   string       `json:"title"`
	Unit    string       `json:"unit"`
	Query   string       `json:"query"` // the real PromQL — the exhibit
	Series  []deepSeries `json:"series"`
	Dropped int          `json:"dropped,omitempty"` // truncated series beyond the cap
}

type deepResponse struct {
	Source string      `json:"source"` // prometheus | unavailable
	TS     string      `json:"ts"`
	Panels []deepPanel `json:"panels"`
}

const (
	deepWindow    = 30 * time.Minute
	deepStep      = 30 * time.Second
	deepCacheTTL  = 15 * time.Second
	deepSeriesCap = 12
	deepQTimeout  = 4 * time.Second
)

const nsMatch = `namespace=~"gipc|data|observability"`

// matrix panels: one query, per-pod series.
var deepMatrixQueries = []struct{ key, title, unit, query string }{
	{"podCpu", "cpu by pod", "cores",
		`sum by (pod) (rate(container_cpu_usage_seconds_total{` + nsMatch + `,container!=""}[2m]))`},
	{"podMem", "memory by pod", "MiB",
		`sum by (pod) (container_memory_working_set_bytes{` + nsMatch + `,container!=""}) / 1048576`},
	{"reqByCode", "request rate by status code", "req/s",
		`sum by (code) (rate(caddy_http_request_duration_seconds_count{handler="subroute"}[2m]))`},
}

// fixed-label panels: N queries, one named series each.
var deepFixedQueries = []struct {
	key, title, unit string
	series           []struct{ label, query string }
}{
	{"latency", "latency ladder", "ms", []struct{ label, query string }{
		{"p50", `histogram_quantile(0.5, sum by (le) (rate(caddy_http_request_duration_seconds_bucket{handler="subroute"}[5m]))) * 1000`},
		{"p95", `histogram_quantile(0.95, sum by (le) (rate(caddy_http_request_duration_seconds_bucket{handler="subroute"}[5m]))) * 1000`},
		{"p99", `histogram_quantile(0.99, sum by (le) (rate(caddy_http_request_duration_seconds_bucket{handler="subroute"}[5m]))) * 1000`},
	}},
	{"errRate", "5xx ratio (caddy)", "%", []struct{ label, query string }{
		{"5xx", `(sum(rate(caddy_http_request_duration_seconds_count{handler="subroute",code=~"5.."}[5m])) or vector(0)) / sum(rate(caddy_http_request_duration_seconds_count{handler="subroute"}[5m])) * 100`},
	}},
	{"nodeFs", "node root-fs used", "%", []struct{ label, query string }{
		{"used", `(1 - sum(node_filesystem_avail_bytes{mountpoint="/"}) / sum(node_filesystem_size_bytes{mountpoint="/"})) * 100`},
	}},
	{"nodeNet", "node network (physical NICs)", "KiB/s", []struct{ label, query string }{
		{"rx", `sum(rate(node_network_receive_bytes_total{device!~"lo|veth.+|cni.+|flannel.+|tailscale.+"}[2m])) / 1024`},
		{"tx", `sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.+|cni.+|flannel.+|tailscale.+"}[2m])) / 1024`},
	}},
}

// projectMatrix caps + name-sorts per-pod series: survivors = top `cap` by max-over-window
// (deterministic tiebreak by label), output sorted by label (stable legends), rest counted.
// The wire label comes ONLY from the grouping label — never the raw map.
func projectMatrix(series []promql.Series, groupLabel string, cap int) ([]deepSeries, int) {
	type scored struct {
		label string
		max   float64
		pts   []promql.Point
	}
	all := make([]scored, 0, len(series))
	unlabelled := 0
	for _, s := range series {
		label := s.Labels[groupLabel]
		if label == "" {
			unlabelled++
			label = fmt.Sprintf("(unlabelled %d)", unlabelled) // unique — duplicate keys break the UI
		}
		max := 0.0
		for _, p := range s.Points {
			if p.V > max {
				max = p.V
			}
		}
		all = append(all, scored{label, max, s.Points})
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].max != all[j].max {
			return all[i].max > all[j].max
		}
		return all[i].label < all[j].label
	})
	dropped := 0
	if len(all) > cap {
		dropped = len(all) - cap
		all = all[:cap]
	}
	sort.Slice(all, func(i, j int) bool { return all[i].label < all[j].label })
	out := make([]deepSeries, 0, len(all))
	for _, s := range all {
		out = append(out, deepSeries{Label: s.label, Points: s.pts})
	}
	return out, dropped
}

func computeDeep(ctx context.Context, prom rangeMatrixer) deepResponse {
	end := time.Now()
	start := end.Add(-deepWindow)

	type job struct {
		panelIdx  int // index into the output panel list
		seriesIdx int // -1 for matrix panels
		query     string
	}
	nPanels := len(deepMatrixQueries) + len(deepFixedQueries)
	panels := make([]deepPanel, nPanels)
	var jobs []job
	for i, q := range deepMatrixQueries {
		panels[i] = deepPanel{Key: q.key, Title: q.title, Unit: q.unit, Query: q.query, Series: []deepSeries{}}
		jobs = append(jobs, job{i, -1, q.query})
	}
	for i, q := range deepFixedQueries {
		pi := len(deepMatrixQueries) + i
		queries := make([]string, 0, len(q.series))
		for _, sq := range q.series {
			queries = append(queries, sq.label+": "+sq.query)
		}
		panels[pi] = deepPanel{Key: q.key, Title: q.title, Unit: q.unit,
			Query: joinQueries(queries), Series: []deepSeries{}}
		for si, sq := range q.series {
			jobs = append(jobs, job{pi, si, sq.query})
		}
	}

	results := make([][]promql.Series, len(jobs))
	oks := make([]bool, len(jobs))
	var wg sync.WaitGroup
	for ji, j := range jobs {
		wg.Add(1)
		go func(ji int, q string) {
			defer wg.Done()
			qctx, cancel := context.WithTimeout(ctx, deepQTimeout)
			defer cancel()
			series, ok, _ := prom.RangeMatrix(qctx, q, start, end, deepStep)
			results[ji] = series
			oks[ji] = ok
		}(ji, j.query)
	}
	wg.Wait()

	anyOK := false
	// fixed-label series slots must land in order — collect per panel.
	fixedBuf := make(map[int][]deepSeries)
	for ji, j := range jobs {
		if !oks[ji] {
			continue
		}
		anyOK = true
		if j.seriesIdx < 0 {
			groupLabel := "pod"
			if panels[j.panelIdx].Key == "reqByCode" {
				groupLabel = "code"
			}
			s, dropped := projectMatrix(results[ji], groupLabel, deepSeriesCap)
			panels[j.panelIdx].Series = s
			panels[j.panelIdx].Dropped = dropped
		} else if len(results[ji]) > 0 {
			fi := j.panelIdx - len(deepMatrixQueries)
			sq := deepFixedQueries[fi].series[j.seriesIdx]
			fixedBuf[j.panelIdx] = append(fixedBuf[j.panelIdx], deepSeries{
				Label: sq.label, Query: sq.query, Points: results[ji][0].Points,
			})
		}
	}
	for pi, buf := range fixedBuf {
		sort.Slice(buf, func(i, j int) bool { return buf[i].Label < buf[j].Label })
		panels[pi].Series = buf
	}

	src := "prometheus"
	if !anyOK {
		src = "unavailable"
	}
	return deepResponse{Source: src, TS: time.Now().UTC().Format(time.RFC3339), Panels: panels}
}

func joinQueries(qs []string) string {
	out := ""
	for i, q := range qs {
		if i > 0 {
			out += "\n"
		}
		out += q
	}
	return out
}

type deepCache struct {
	mu      sync.Mutex
	at      time.Time
	payload *deepResponse
}

func deepHandler(prom rangeMatrixer, cache *deepCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cache.mu.Lock()
		if cache.payload != nil && time.Since(cache.at) < deepCacheTTL {
			payload := cache.payload // snapshot; serialize outside the lock (replace-only)
			cache.mu.Unlock()
			writeJSON(w, http.StatusOK, payload)
			return
		}
		defer cache.mu.Unlock()
		out := computeDeep(r.Context(), prom)
		if out.Source != "unavailable" { // failures are never cached
			cache.payload, cache.at = &out, time.Now()
		}
		writeJSON(w, http.StatusOK, out)
	}
}
