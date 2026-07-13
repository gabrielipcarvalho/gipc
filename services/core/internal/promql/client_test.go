package promql

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
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
