package loki

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestVolumeParsesMatrixByContainer(t *testing.T) {
	mr := matrixResp{}
	mr.Data.ResultType = "matrix"
	mr.Data.Result = []struct {
		Metric map[string]string `json:"metric"`
		Values [][2]any          `json:"values"`
	}{
		{Metric: map[string]string{"container": "core"}, Values: [][2]any{{float64(1000), "42"}}},
		{Metric: map[string]string{}, Values: [][2]any{{float64(1000), "7"}}},
	}
	out := parseVolume(mr)
	if len(out) != 2 || out[0].Label != "core" || out[1].Label != "(unlabelled)" {
		t.Fatalf("%+v", out)
	}
	if out[0].Points[0].V != 42 {
		t.Fatalf("%+v", out[0])
	}
}

func TestVolumeHTTPErrorSurfaces(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()
	if _, err := New(srv.URL).Volume(context.Background(), "q", time.Minute, time.Second); err == nil {
		t.Fatal("expected error on 500")
	}
}
