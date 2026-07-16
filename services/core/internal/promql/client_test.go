package promql

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func fakeProm(body string, code int) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(code)
		_, _ = w.Write([]byte(body))
	}))
}

func TestQueryVector(t *testing.T) {
	ts := fakeProm(`{"status":"success","data":{"resultType":"vector","result":[{"value":[1234.5,"42.5"]}]}}`, 200)
	defer ts.Close()
	v, ok, err := New(ts.URL).Query(context.Background(), "up")
	if err != nil || !ok || v != 42.5 {
		t.Fatalf("got v=%v ok=%v err=%v, want 42.5 true nil", v, ok, err)
	}
}

func TestQueryEmpty(t *testing.T) {
	ts := fakeProm(`{"status":"success","data":{"resultType":"vector","result":[]}}`, 200)
	defer ts.Close()
	_, ok, err := New(ts.URL).Query(context.Background(), "up")
	if err != nil || ok {
		t.Fatalf("empty: ok=%v err=%v, want false nil", ok, err)
	}
}

func TestQueryNonFinite(t *testing.T) {
	ts := fakeProm(`{"status":"success","data":{"resultType":"vector","result":[{"value":[1,"NaN"]}]}}`, 200)
	defer ts.Close()
	if _, ok, _ := New(ts.URL).Query(context.Background(), "up"); ok {
		t.Fatal("NaN must be ok=false")
	}
}

func TestQueryHTTPError(t *testing.T) {
	ts := fakeProm(`boom`, 500)
	defer ts.Close()
	_, ok, err := New(ts.URL).Query(context.Background(), "up")
	if err == nil || ok {
		t.Fatalf("500: ok=%v err=%v, want false + error", ok, err)
	}
}

func TestRangeMatrixDecodesLabeledSeries(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[
			{"metric":{"pod":"web-1"},"values":[[1000,"0.5"],[1030,"0.6"],[1060,"bad"]]},
			{"metric":{"pod":"core-1"},"values":[[1000,"NaN"]]}]}}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	series, ok, err := c.RangeMatrix(context.Background(), "q", time.Unix(0, 0), time.Unix(100, 0), 30*time.Second)
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if len(series) != 1 { // core-1's only sample is NaN → zero points → dropped
		t.Fatalf("series=%d", len(series))
	}
	if series[0].Labels["pod"] != "web-1" || len(series[0].Points) != 2 {
		t.Fatalf("%+v", series[0])
	}
}

func TestRangeMatrixEmptyNotOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`))
	}))
	defer srv.Close()
	_, ok, err := New(srv.URL).RangeMatrix(context.Background(), "q", time.Unix(0, 0), time.Unix(1, 0), time.Second)
	if ok || err != nil {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
}
