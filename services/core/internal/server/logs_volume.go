package server

// /api/logs/volume — Loki log-volume histogram by container (≈ app on this cluster; promtail
// labels streams namespace/pod/container only — there is no `app` label in Loki). FIXED LogQL,
// no parameters; step == the count_over_time range so bars are disjoint counts.

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/loki"
)

type volumer interface {
	Volume(ctx context.Context, logql string, window, step time.Duration) ([]loki.VolumeSeries, error)
}

const (
	volumeLogQL     = `sum by (container) (count_over_time({namespace=~"gipc|data|observability"} [5m]))`
	volumeWindow    = 30 * time.Minute
	volumeStep      = 5 * time.Minute // == the count_over_time range → disjoint buckets
	volumeSeriesCap = 8
)

type volumeResponse struct {
	Source string              `json:"source"` // loki | unavailable
	TS     string              `json:"ts"`
	Query  string              `json:"query"` // the real LogQL — the exhibit
	Series []loki.VolumeSeries `json:"series"`
}

func logsVolumeHandler(lk volumer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()
		out := volumeResponse{TS: time.Now().UTC().Format(time.RFC3339), Query: volumeLogQL,
			Series: []loki.VolumeSeries{}}
		series, err := lk.Volume(ctx, volumeLogQL, volumeWindow, volumeStep)
		if err != nil {
			out.Source = "unavailable"
			writeJSON(w, http.StatusOK, out)
			return
		}
		// cap: top N by total count (deterministic tiebreak by label), output name-sorted.
		sort.Slice(series, func(i, j int) bool {
			ti, tj := seriesTotal(series[i]), seriesTotal(series[j])
			if ti != tj {
				return ti > tj
			}
			return series[i].Label < series[j].Label
		})
		if len(series) > volumeSeriesCap {
			series = series[:volumeSeriesCap]
		}
		sort.Slice(series, func(i, j int) bool { return series[i].Label < series[j].Label })
		out.Source = "loki"
		out.Series = series
		writeJSON(w, http.StatusOK, out)
	}
}

func seriesTotal(s loki.VolumeSeries) float64 {
	t := 0.0
	for _, p := range s.Points {
		t += p.V
	}
	return t
}
