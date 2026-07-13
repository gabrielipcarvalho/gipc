package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCFParsing(t *testing.T) {
	if got := cfColo("7d3f1a2b3c4d5e6f-SYD"); got != "SYD" {
		t.Fatalf("cfColo=%q, want SYD", got)
	}
	if got := cfColo("malformed"); got != "" {
		t.Fatalf("cfColo(malformed)=%q, want empty", got)
	}
	if got := cfColo("id-syd"); got != "" { // lowercase → rejected by ^[A-Z]{3}$
		t.Fatalf("cfColo(lowercase)=%q, want empty", got)
	}
	if got := cfCountry("AU"); got != "AU" {
		t.Fatalf("cfCountry=%q, want AU", got)
	}
	if got := cfCountry("australia"); got != "" {
		t.Fatalf("cfCountry(bad)=%q, want empty", got)
	}
}

// TestTraceHops: 4 hops, only "core" is measured (real ms), edge reflects validated CF headers, and the
// visitor IP is never present in the response.
func TestTraceHops(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/trace", nil)
	req.Header.Set("CF-Ray", "7d3f1a2b3c4d5e6f-SYD")
	req.Header.Set("CF-IPCountry", "AU")
	req.Header.Set("CF-Connecting-IP", "203.0.113.42")
	rec := httptest.NewRecorder()
	traceHandler()(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("code %d, want 200", rec.Code)
	}
	var tr TraceResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &tr); err != nil {
		t.Fatal(err)
	}
	if tr.Edge.Colo != "SYD" || tr.Edge.Country != "AU" {
		t.Fatalf("edge=%+v, want SYD/AU", tr.Edge)
	}
	if len(tr.Hops) != 4 {
		t.Fatalf("want 4 hops, got %d", len(tr.Hops))
	}
	measured := 0
	for _, h := range tr.Hops {
		if h.Measured {
			measured++
			if h.Name != "core" || h.Ms == nil {
				t.Fatalf("only core is measured with a real ms, got %+v", h)
			}
		} else if h.Ms != nil {
			t.Fatalf("unmeasured hop %s must have null ms", h.Name)
		}
	}
	if measured != 1 {
		t.Fatalf("want exactly 1 measured hop, got %d", measured)
	}
	if body := rec.Body.String(); strings.Contains(body, "203.0.113.42") {
		t.Fatalf("visitor IP leaked into trace: %s", body)
	}
}
