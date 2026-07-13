package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// TestStatusPartial: one query returns empty → that metric ok:false, the rest ok, source still "prometheus".
func TestStatusPartial(t *testing.T) {
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Query().Get("query"), "container_memory") { // memMiB → empty
			_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[]}}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[{"value":[1,"2"]}]}}`))
	}))
	defer prom.Close()

	rec := httptest.NewRecorder()
	statusHandler(promql.New(prom.URL))(rec, httptest.NewRequest("GET", "/api/status", nil))
	var s Status
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if s.Source != "prometheus" {
		t.Fatalf("source=%q, want prometheus (some ok)", s.Source)
	}
	if m := s.Metrics["memMiB"]; m.OK || m.Value != nil {
		t.Fatalf("memMiB must be ok:false/null: %+v", m)
	}
	if m := s.Metrics["reqPerSec"]; !m.OK || m.Value == nil {
		t.Fatalf("reqPerSec must be ok: %+v", m)
	}
}

func TestStatusAllOK(t *testing.T) {
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[{"value":[1,"1.5"]}]}}`))
	}))
	defer prom.Close()

	rec := httptest.NewRecorder()
	statusHandler(promql.New(prom.URL))(rec, httptest.NewRequest("GET", "/api/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code %d, want 200", rec.Code)
	}
	var s Status
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if s.Source != "prometheus" {
		t.Fatalf("source=%q, want prometheus", s.Source)
	}
	if len(s.Metrics) != 5 {
		t.Fatalf("want 5 metrics, got %d", len(s.Metrics))
	}
	if m := s.Metrics["reqPerSec"]; !m.OK || m.Value == nil || *m.Value != 1.5 {
		t.Fatalf("reqPerSec=%+v, want ok/1.5", m)
	}
}

func TestStatusPrometheusDown(t *testing.T) {
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	prom.Close() // closed → connection refused → every query fails

	rec := httptest.NewRecorder()
	statusHandler(promql.New(prom.URL))(rec, httptest.NewRequest("GET", "/api/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("must still be 200, got %d", rec.Code) // never hard-fails
	}
	var s Status
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if s.Source != "unavailable" {
		t.Fatalf("source=%q, want unavailable", s.Source)
	}
	for k, m := range s.Metrics {
		if m.OK || m.Value != nil {
			t.Fatalf("metric %s must be ok:false/null when prometheus down: %+v", k, m)
		}
	}
}
