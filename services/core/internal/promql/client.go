// Package promql is a tiny stdlib Prometheus HTTP query client: instant vector → first scalar.
// No external deps (the service stays go.sum-free).
package promql

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
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

type queryResp struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Value [2]any `json:"value"` // [ <ts float>, "<val string>" ]
		} `json:"result"`
	} `json:"data"`
}

// Query runs an instant PromQL query and returns the first result's scalar value.
// ok=false (no error) on empty result or non-finite value — so callers treat "no data"
// as a graceful gap, not a failure. err is only for transport/decoding problems.
func (c *Client) Query(ctx context.Context, q string) (float64, bool, error) {
	u := c.base + "/api/v1/query?" + url.Values{"query": {q}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return 0, false, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, false, fmt.Errorf("prometheus status %d", resp.StatusCode)
	}
	var qr queryResp
	if err := json.NewDecoder(resp.Body).Decode(&qr); err != nil {
		return 0, false, err
	}
	if qr.Status != "success" || len(qr.Data.Result) == 0 {
		return 0, false, nil
	}
	s, ok := qr.Data.Result[0].Value[1].(string)
	if !ok {
		return 0, false, nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, false, nil
	}
	return v, true, nil
}

// Point is one (unix-seconds, value) sample of a range series.
type Point struct {
	T int64   `json:"t"`
	V float64 `json:"v"`
}

type rangeResp struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"` // "matrix"
		Result     []struct {
			Values [][2]any `json:"values"` // [ [ <ts float>, "<val string>" ], ... ]
		} `json:"result"`
	} `json:"data"`
}

// Range runs a range query and returns the first series' samples. Non-finite/unparseable samples are
// skipped. ok=false (no error) on an empty result — callers render "no data" honestly. Matches Query's
// contract: err is only for transport/decoding problems.
func (c *Client) Range(ctx context.Context, q string, start, end time.Time, step time.Duration) ([]Point, bool, error) {
	u := c.base + "/api/v1/query_range?" + url.Values{
		"query": {q},
		"start": {strconv.FormatInt(start.Unix(), 10)},
		"end":   {strconv.FormatInt(end.Unix(), 10)},
		"step":  {strconv.FormatFloat(step.Seconds(), 'f', -1, 64)},
	}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, false, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("prometheus status %d", resp.StatusCode)
	}
	var rr rangeResp
	if err := json.NewDecoder(resp.Body).Decode(&rr); err != nil {
		return nil, false, err
	}
	if rr.Status != "success" || len(rr.Data.Result) == 0 {
		return nil, false, nil
	}
	pts := make([]Point, 0, len(rr.Data.Result[0].Values))
	for _, val := range rr.Data.Result[0].Values {
		ts, ok := val[0].(float64)
		if !ok {
			continue
		}
		s, ok := val[1].(string)
		if !ok {
			continue
		}
		v, err := strconv.ParseFloat(s, 64)
		if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
			continue
		}
		pts = append(pts, Point{T: int64(ts), V: v})
	}
	if len(pts) == 0 {
		return nil, false, nil
	}
	return pts, true, nil
}

// Series is one labeled range series from a matrix result.
type Series struct {
	Labels map[string]string
	Points []Point
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

// RangeMatrix runs a range query and returns ALL series with their label sets. Non-finite/
// unparseable samples are skipped; series left with zero points are dropped. ok=false (no error)
// on an empty result. Same contract as Range: err is transport/decoding only.
func (c *Client) RangeMatrix(ctx context.Context, q string, start, end time.Time, step time.Duration) ([]Series, bool, error) {
	u := c.base + "/api/v1/query_range?" + url.Values{
		"query": {q},
		"start": {strconv.FormatInt(start.Unix(), 10)},
		"end":   {strconv.FormatInt(end.Unix(), 10)},
		"step":  {strconv.FormatFloat(step.Seconds(), 'f', -1, 64)},
	}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, false, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("prometheus status %d", resp.StatusCode)
	}
	var mr matrixResp
	if err := json.NewDecoder(resp.Body).Decode(&mr); err != nil {
		return nil, false, err
	}
	if mr.Status != "success" || len(mr.Data.Result) == 0 {
		return nil, false, nil
	}
	out := make([]Series, 0, len(mr.Data.Result))
	for _, r := range mr.Data.Result {
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
		if len(pts) == 0 {
			continue
		}
		out = append(out, Series{Labels: r.Metric, Points: pts})
	}
	if len(out) == 0 {
		return nil, false, nil
	}
	return out, true, nil
}
