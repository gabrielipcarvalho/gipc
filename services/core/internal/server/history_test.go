package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// TestHistoryPartial: the cpu range query returns empty → cpuCores is an empty (non-null) array, the
// others carry samples, source stays "prometheus".
func TestHistoryPartial(t *testing.T) {
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Query().Get("query"), "container_cpu") { // cpuCores → empty
			_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[{"values":[[1700000000,"1.5"],[1700000030,"1.6"]]}]}}`))
	}))
	defer prom.Close()

	rec := httptest.NewRecorder()
	historyHandler(promql.New(prom.URL))(rec, httptest.NewRequest("GET", "/api/metrics/history", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code %d, want 200", rec.Code)
	}
	var h History
	if err := json.Unmarshal(rec.Body.Bytes(), &h); err != nil {
		t.Fatal(err)
	}
	if h.Source != "prometheus" {
		t.Fatalf("source=%q, want prometheus", h.Source)
	}
	if h.Series["cpuCores"] == nil || len(h.Series["cpuCores"]) != 0 {
		t.Fatalf("cpuCores must be an empty non-null array, got %+v", h.Series["cpuCores"])
	}
	req := h.Series["reqPerSec"]
	if len(req) != 2 || req[0].V != 1.5 || req[0].T != 1700000000 {
		t.Fatalf("reqPerSec samples wrong: %+v", req)
	}
}

// TestHistoryDown: Prometheus unreachable → 200, source "unavailable", every series an empty array.
func TestHistoryDown(t *testing.T) {
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	prom.Close()
	rec := httptest.NewRecorder()
	historyHandler(promql.New(prom.URL))(rec, httptest.NewRequest("GET", "/api/metrics/history", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("must still be 200, got %d", rec.Code)
	}
	var h History
	if err := json.Unmarshal(rec.Body.Bytes(), &h); err != nil {
		t.Fatal(err)
	}
	if h.Source != "unavailable" {
		t.Fatalf("source=%q, want unavailable", h.Source)
	}
	for k, s := range h.Series {
		if s == nil || len(s) != 0 {
			t.Fatalf("series %s must be empty when down, got %+v", k, s)
		}
	}
}
