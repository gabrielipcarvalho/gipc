// Package loki is a tiny stdlib Loki HTTP query client for the public log surface.
// No external deps (the service stays go.sum-free). It runs ONLY server-built, allow-listed
// queries — never client-supplied LogQL — and the caller redacts before anything is exposed.
package loki

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"time"
)

type Client struct {
	base string
	http *http.Client
}

func New(base string) *Client {
	return &Client{base: base, http: &http.Client{Timeout: 4 * time.Second}}
}

// LogLine is one raw Loki entry. Line is UNREDACTED — the caller MUST redact before exposing it.
type LogLine struct {
	TsNs      int64
	NS        string
	Pod       string
	Container string
	Line      string
}

// Loki LOG queries return resultType:"streams": each result element is one label-set with its own
// values array. This is NOT the metrics "matrix" shape — do not reuse promql.Range.
type streamsResp struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"` // "streams"
		Result     []struct {
			Stream map[string]string `json:"stream"`
			Values [][2]string       `json:"values"` // [ [ "<ts_ns>", "<line>" ], ... ]
		} `json:"result"`
	} `json:"data"`
}

// Query runs a range log query over the last `window` and returns up to `limit` entries, newest-first.
// Loki does not return a globally-sorted list across streams, so we merge every stream then sort DESC.
// err is only for transport/decoding problems; an empty result is (nil, nil).
func (c *Client) Query(ctx context.Context, logql string, window time.Duration, limit int) ([]LogLine, error) {
	end := time.Now()
	start := end.Add(-window)
	u := c.base + "/loki/api/v1/query_range?" + url.Values{
		"query":     {logql},
		"start":     {strconv.FormatInt(start.UnixNano(), 10)},
		"end":       {strconv.FormatInt(end.UnixNano(), 10)},
		"limit":     {strconv.Itoa(limit)},
		"direction": {"backward"},
	}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki status %d", resp.StatusCode)
	}
	var sr streamsResp
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, err
	}
	lines := parseStreams(sr)
	sort.Slice(lines, func(i, j int) bool { return lines[i].TsNs > lines[j].TsNs })
	if len(lines) > limit {
		lines = lines[:limit]
	}
	return lines, nil
}

// parseStreams flattens every stream's values into LogLines (split out for unit testing).
func parseStreams(sr streamsResp) []LogLine {
	var out []LogLine
	for _, st := range sr.Data.Result {
		for _, v := range st.Values {
			ts, err := strconv.ParseInt(v[0], 10, 64)
			if err != nil {
				continue
			}
			out = append(out, LogLine{
				TsNs:      ts,
				NS:        st.Stream["namespace"],
				Pod:       st.Stream["pod"],
				Container: st.Stream["container"],
				Line:      v[1],
			})
		}
	}
	return out
}

// VolumeSeries is one labeled metric series from a Loki METRIC query (resultType "matrix" —
// count_over_time etc. — distinct from the "streams" log shape above).
type VolumeSeries struct {
	Label  string  `json:"label"` // the container stream label (≈ app on this cluster)
	Points []Point `json:"points"`
}

// Point mirrors promql.Point ({t,v} — the house wire shape).
type Point struct {
	T int64   `json:"t"`
	V float64 `json:"v"`
}

type matrixResp struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"` // "matrix"
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Values [][2]any          `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

// Volume runs a FIXED metric LogQL (count_over_time) over the last window and returns per-label
// series. The label is projected from the `container` stream label ONLY — the raw label map is
// never exposed. err is transport/decoding only; empty result → (nil, nil).
func (c *Client) Volume(ctx context.Context, logql string, window, step time.Duration) ([]VolumeSeries, error) {
	end := time.Now()
	start := end.Add(-window)
	u := c.base + "/loki/api/v1/query_range?" + url.Values{
		"query": {logql},
		"start": {strconv.FormatInt(start.UnixNano(), 10)},
		"end":   {strconv.FormatInt(end.UnixNano(), 10)},
		"step":  {strconv.FormatFloat(step.Seconds(), 'f', -1, 64) + "s"},
	}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki status %d", resp.StatusCode)
	}
	var mr matrixResp
	if err := json.NewDecoder(resp.Body).Decode(&mr); err != nil {
		return nil, err
	}
	return parseVolume(mr), nil
}

// parseVolume projects matrix series to (container-label, points) — split out for unit tests.
func parseVolume(mr matrixResp) []VolumeSeries {
	out := make([]VolumeSeries, 0, len(mr.Data.Result))
	for _, r := range mr.Data.Result {
		label := r.Metric["container"]
		if label == "" {
			label = "(unlabelled)"
		}
		pts := make([]Point, 0, len(r.Values))
		for _, val := range r.Values {
			ts, tok := val[0].(float64)
			sv, sok := val[1].(string)
			if !tok || !sok {
				continue
			}
			v, err := strconv.ParseFloat(sv, 64)
			if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
				continue
			}
			pts = append(pts, Point{T: int64(ts), V: v})
		}
		if len(pts) > 0 {
			out = append(out, VolumeSeries{Label: label, Points: pts})
		}
	}
	return out
}
