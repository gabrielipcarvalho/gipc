package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/k8s"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// fakeKiller is a test podKiller — records the DeletePod target, serves canned pods/errors.
type fakeKiller struct {
	pods       []k8s.Pod
	listErr    error
	delErr     error
	deleted    string
	listedSel  string
	deleteCall int
}

func (f *fakeKiller) ListPods(_ context.Context, sel string) ([]k8s.Pod, error) {
	f.listedSel = sel
	return f.pods, f.listErr
}
func (f *fakeKiller) DeletePod(_ context.Context, name string) error {
	f.deleteCall++
	f.deleted = name
	return f.delErr
}

var testCfg = config.Config{ChaosTargetSelector: "app=chaos-target", LabNamespace: "demo"}

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func doKill(h http.HandlerFunc) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest("POST", "/api/lab/chaos", nil))
	return rec
}

func TestChaosKillDisabled(t *testing.T) {
	rec := doKill(chaosKillHandler(nil, testCfg, discardLog())) // untyped-nil podKiller
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rec.Code)
	}
}

func TestChaosKillHappy(t *testing.T) {
	fk := &fakeKiller{pods: []k8s.Pod{
		{Name: "chaos-target-a", Phase: "Running"},
		{Name: "chaos-target-b", Phase: "Pending"}, // must NOT be picked
		{Name: "chaos-target-c", Phase: "Running"},
	}}
	rec := doKill(chaosKillHandler(fk, testCfg, discardLog()))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200", rec.Code)
	}
	if fk.listedSel != "app=chaos-target" {
		t.Errorf("selector = %q", fk.listedSel)
	}
	// only a Running, listed pod is killed
	if fk.deleted != "chaos-target-a" && fk.deleted != "chaos-target-c" {
		t.Errorf("deleted = %q, want a Running chaos-target pod", fk.deleted)
	}
	var body map[string]string
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body["killed"] != fk.deleted || body["at"] == "" {
		t.Errorf("body = %+v", body)
	}
}

func TestChaosKillNoRunning(t *testing.T) {
	fk := &fakeKiller{pods: []k8s.Pod{{Name: "x", Phase: "Pending"}}}
	rec := doKill(chaosKillHandler(fk, testCfg, discardLog()))
	if rec.Code != http.StatusConflict {
		t.Fatalf("code = %d, want 409", rec.Code)
	}
	if fk.deleteCall != 0 {
		t.Error("DeletePod called with no Running pods")
	}
}

func TestChaosKillListErr(t *testing.T) {
	fk := &fakeKiller{listErr: context.DeadlineExceeded}
	rec := doKill(chaosKillHandler(fk, testCfg, discardLog()))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rec.Code)
	}
}

func TestChaosKillDeleteErr(t *testing.T) {
	fk := &fakeKiller{pods: []k8s.Pod{{Name: "chaos-target-a", Phase: "Running"}}, delErr: context.DeadlineExceeded}
	rec := doKill(chaosKillHandler(fk, testCfg, discardLog()))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("code = %d, want 502", rec.Code)
	}
}

func TestChaosStatus(t *testing.T) {
	// fake Prometheus returning desired=3, ready=2 (mid self-heal)
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v := "3"
		if q := r.URL.Query().Get("query"); q != "" && contains(q, "available") {
			v = "2"
		}
		w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[{"value":[0,"` + v + `"]}]}}`))
	}))
	defer prom.Close()
	fk := &fakeKiller{pods: []k8s.Pod{{Name: "chaos-target-a", Phase: "Running", AgeSeconds: 10}}}

	rec := httptest.NewRecorder()
	chaosStatusHandler(promql.New(prom.URL), fk, testCfg)(rec, httptest.NewRequest("GET", "/api/lab/chaos/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
	var st ChaosStatus
	json.Unmarshal(rec.Body.Bytes(), &st)
	if st.Desired == nil || *st.Desired != 3 || st.Ready == nil || *st.Ready != 2 {
		t.Errorf("desired/ready = %v/%v, want 3/2", st.Desired, st.Ready)
	}
	if len(st.Pods) != 1 || st.Pods[0].Name != "chaos-target-a" {
		t.Errorf("pods = %+v", st.Pods)
	}
}

func TestChaosStatusGracefulNoProm(t *testing.T) {
	// Prometheus down → desired/ready null, still 200
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(500) }))
	defer prom.Close()
	rec := httptest.NewRecorder()
	chaosStatusHandler(promql.New(prom.URL), nil, testCfg)(rec, httptest.NewRequest("GET", "/x", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want graceful 200", rec.Code)
	}
	var st ChaosStatus
	json.Unmarshal(rec.Body.Bytes(), &st)
	if st.Desired != nil || st.Ready != nil {
		t.Errorf("want null metrics when prom down, got %v/%v", st.Desired, st.Ready)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
