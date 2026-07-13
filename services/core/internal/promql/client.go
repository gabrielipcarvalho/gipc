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
