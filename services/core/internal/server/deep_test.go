package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/loki"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

type fakeMatrixer struct {
	calls   atomic.Int64
	failAll bool
	// perQuery returns series for a query; nil → one default series
	perQuery func(q string) []promql.Series
}

func (f *fakeMatrixer) RangeMatrix(_ context.Context, q string, _, _ time.Time, _ time.Duration) ([]promql.Series, bool, error) {
	f.calls.Add(1)
	if f.failAll {
		return nil, false, nil
	}
	if f.perQuery != nil {
		s := f.perQuery(q)
		if s == nil {
			return nil, false, nil
		}
		return s, true, nil
	}
	return []promql.Series{{
		Labels: map[string]string{"pod": "web-abc", "instance": "192.168.20.14:9100", "node": "garuda"},
		Points: []promql.Point{{T: 1, V: 0.5}},
	}}, true, nil
}

func getDeep(t *testing.T, fm rangeMatrixer, cache *deepCache) (int, deepResponse, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	deepHandler(fm, cache)(rec, httptest.NewRequest("GET", "/api/metrics/deep", nil))
	var out deepResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return rec.Code, out, rec.Body.String()
}

func TestDeepEveryPanelPresentWithQueryText(t *testing.T) {
	_, out, _ := getDeep(t, &fakeMatrixer{}, &deepCache{})
	want := len(deepMatrixQueries) + len(deepFixedQueries)
	if len(out.Panels) != want {
		t.Fatalf("panels=%d want %d", len(out.Panels), want)
	}
	for _, p := range out.Panels {
		if p.Query == "" {
			t.Errorf("panel %s missing query text", p.Key)
		}
	}
}

func TestDeepLabelLeakProjection(t *testing.T) {
	_, _, raw := getDeep(t, &fakeMatrixer{}, &deepCache{})
	if strings.Contains(raw, "192.168.20.14") || strings.Contains(raw, "garuda") || strings.Contains(raw, "instance") {
		t.Fatal("raw Prometheus labels leaked into the wire JSON")
	}
}

func TestDeepAllFailSourceUnavailableNotCached(t *testing.T) {
	fm := &fakeMatrixer{failAll: true}
	cache := &deepCache{}
	_, out, _ := getDeep(t, fm, cache)
	if out.Source != "unavailable" {
		t.Fatalf("source=%s", out.Source)
	}
	if cache.payload != nil {
		t.Fatal("failure cached")
	}
	// every panel still present with its query — the exhibit survives the outage
	for _, p := range out.Panels {
		if p.Query == "" || p.Series == nil {
			t.Errorf("panel %s must keep query + non-nil series", p.Key)
		}
	}
}

func TestDeepCapTruncatesNameSortsAndCountsDropped(t *testing.T) {
	fm := &fakeMatrixer{perQuery: func(q string) []promql.Series {
		if !strings.Contains(q, "sum by (pod)") {
			return nil
		}
		var out []promql.Series
		for i := 0; i < 15; i++ {
			out = append(out, promql.Series{
				Labels: map[string]string{"pod": fmt.Sprintf("pod-%02d", i)},
				Points: []promql.Point{{T: 1, V: float64(i)}},
			})
		}
		return out
	}}
	_, out, _ := getDeep(t, fm, &deepCache{})
	var cpu *deepPanel
	for i := range out.Panels {
		if out.Panels[i].Key == "podCpu" {
			cpu = &out.Panels[i]
		}
	}
	if cpu == nil || len(cpu.Series) != deepSeriesCap || cpu.Dropped != 3 {
		t.Fatalf("cap: series=%d dropped=%d", len(cpu.Series), cpu.Dropped)
	}
	for i := 1; i < len(cpu.Series); i++ {
		if cpu.Series[i-1].Label > cpu.Series[i].Label {
			t.Fatal("series not name-sorted")
		}
	}
	// top-by-max survived: pod-14 (max value) kept, pod-00..02 (lowest) dropped
	labels := make(map[string]bool)
	for _, s := range cpu.Series {
		labels[s.Label] = true
	}
	if !labels["pod-14"] || labels["pod-00"] {
		t.Fatal("wrong survivors")
	}
}

func TestDeepLadderMergesNamedSeries(t *testing.T) {
	_, out, _ := getDeep(t, &fakeMatrixer{}, &deepCache{})
	for _, p := range out.Panels {
		if p.Key != "latency" {
			continue
		}
		if len(p.Series) != 3 {
			t.Fatalf("ladder series=%d", len(p.Series))
		}
		wantOrder := []string{"p50", "p95", "p99"}
		for i, s := range p.Series {
			if s.Label != wantOrder[i] {
				t.Fatalf("ladder order %v", p.Series)
			}
			if s.Query == "" || !strings.Contains(s.Query, "histogram_quantile") {
				t.Fatalf("ladder series must carry its real per-quantile query")
			}
		}
	}
}

func TestDeepCacheSingleFlight(t *testing.T) {
	fm := &fakeMatrixer{}
	cache := &deepCache{}
	getDeep(t, fm, cache)
	n := fm.calls.Load()
	getDeep(t, fm, cache)
	if fm.calls.Load() != n {
		t.Fatal("cache miss within TTL")
	}
}

// ---- logs volume ----------------------------------------------------------------

type fakeVolumer struct {
	series []loki.VolumeSeries
	err    error
}

func (f *fakeVolumer) Volume(_ context.Context, _ string, _, _ time.Duration) ([]loki.VolumeSeries, error) {
	return f.series, f.err
}

func TestLogsVolumeCapAndSort(t *testing.T) {
	var series []loki.VolumeSeries
	for i := 0; i < 10; i++ {
		series = append(series, loki.VolumeSeries{
			Label:  fmt.Sprintf("app-%02d", i),
			Points: []loki.Point{{T: 1, V: float64(i)}},
		})
	}
	rec := httptest.NewRecorder()
	logsVolumeHandler(&fakeVolumer{series: series})(rec, httptest.NewRequest("GET", "/api/logs/volume", nil))
	var out volumeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Source != "loki" || len(out.Series) != volumeSeriesCap || out.Query == "" {
		t.Fatalf("source=%s series=%d", out.Source, len(out.Series))
	}
	for i := 1; i < len(out.Series); i++ {
		if out.Series[i-1].Label > out.Series[i].Label {
			t.Fatal("not name-sorted")
		}
	}
	// lowest-total series dropped
	for _, s := range out.Series {
		if s.Label == "app-00" || s.Label == "app-01" {
			t.Fatal("wrong survivors")
		}
	}
}

func TestLogsVolumeDownHonest(t *testing.T) {
	rec := httptest.NewRecorder()
	logsVolumeHandler(&fakeVolumer{err: fmt.Errorf("boom")})(rec, httptest.NewRequest("GET", "/api/logs/volume", nil))
	var out volumeResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Source != "unavailable" || out.Query == "" || out.Series == nil {
		t.Fatalf("%+v", out)
	}
}

func TestDeepPartialFailureKeepsSourceAndExhibits(t *testing.T) {
	// only the pod-matrix queries succeed; everything else fails
	fm := &fakeMatrixer{perQuery: func(q string) []promql.Series {
		if !strings.Contains(q, "sum by (pod)") {
			return nil
		}
		return []promql.Series{{Labels: map[string]string{"pod": "web-1"}, Points: []promql.Point{{T: 1, V: 1}}}}
	}}
	_, out, _ := getDeep(t, fm, &deepCache{})
	if out.Source != "prometheus" {
		t.Fatalf("partial failure must keep source=prometheus, got %s", out.Source)
	}
	for _, p := range out.Panels {
		if p.Key == "latency" || p.Key == "reqByCode" {
			if len(p.Series) != 0 || p.Query == "" {
				t.Fatalf("failed panel %s must keep empty series + its query text", p.Key)
			}
		}
	}
}
