package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/loki"
)

// TestRedactLine: IPs (v4+v6), internal hostnames, and secret shapes are masked; a benign clock
// (colons but not an IP) is preserved (net.ParseIP guards against the false-match).
func TestRedactLine(t *testing.T) {
	cases := []struct {
		in          string
		mustNotHave string // substring that must be gone
		mustKeep    string // substring that must survive
	}{
		{in: "conn from 203.0.113.9 ok", mustNotHave: "203.0.113.9", mustKeep: "conn from"},
		{in: "peer 2001:db8::1 closed", mustNotHave: "2001:db8::1", mustKeep: "closed"},
		{in: "dialing loki.observability:3100", mustNotHave: "loki.observability", mustKeep: "dialing"},
		{in: "auth Bearer sk-live-abcdef123456 done", mustNotHave: "sk-live-abcdef123456", mustKeep: "auth"},
		{in: "served at 12:34:56 fine", mustNotHave: "", mustKeep: "12:34:56"},
	}
	for _, c := range cases {
		got := redactLine(c.in)
		if c.mustNotHave != "" && strings.Contains(got, c.mustNotHave) {
			t.Errorf("redactLine(%q)=%q — must NOT contain %q", c.in, got, c.mustNotHave)
		}
		if c.mustKeep != "" && !strings.Contains(got, c.mustKeep) {
			t.Errorf("redactLine(%q)=%q — must keep %q", c.in, got, c.mustKeep)
		}
	}
}

// TestSanitizeDropsIP: the structural fix — a core slog line's `ip`/`request_id` fields NEVER surface,
// while method/path/status do.
func TestSanitizeDropsIP(t *testing.T) {
	raw := loki.LogLine{
		TsNs: 1_700_000_000_000_000_000, NS: "gipc", Pod: "core-x", Container: "core",
		Line: `{"level":"INFO","msg":"request","method":"GET","path":"/work","status":200,"dur_ms":2,"ip":"203.0.113.9","request_id":"deadbeef"}`,
	}
	v := sanitizeLine(raw)
	if strings.Contains(v.Msg, "203.0.113.9") {
		t.Fatalf("visitor IP leaked into log msg: %q", v.Msg)
	}
	if strings.Contains(v.Msg, "deadbeef") {
		t.Fatalf("request_id leaked (unlisted key): %q", v.Msg)
	}
	if !strings.Contains(v.Msg, "GET") || !strings.Contains(v.Msg, "/work") {
		t.Fatalf("expected method+path in msg, got %q", v.Msg)
	}
	if v.Level != "INFO" {
		t.Fatalf("level=%q, want INFO", v.Level)
	}
}

// TestSanitizeInvalidJSONFallsThrough: a `{`-prefixed line that fails to decode is redacted whole-line,
// never emitted raw (an IP in it is still masked).
func TestSanitizeInvalidJSONFallsThrough(t *testing.T) {
	v := sanitizeLine(loki.LogLine{TsNs: 1, Line: `{not valid json 198.51.100.7`})
	if strings.Contains(v.Msg, "198.51.100.7") {
		t.Fatalf("IP leaked from malformed-JSON fallback: %q", v.Msg)
	}
	if !strings.Contains(v.Msg, "not valid json") {
		t.Fatalf("fallback should redact-not-drop the line, got %q", v.Msg)
	}
}

// TestLogsHandlerFixedQuery: the handler runs the FIXED {namespace="gipc"} query regardless of any
// injected ?query= param, returns lines newest-first, and redacts a planted secret.
func TestLogsHandlerFixedQuery(t *testing.T) {
	var sawQuery string
	lokiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawQuery = r.URL.Query().Get("query")
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"streams","result":[
			{"stream":{"namespace":"gipc","pod":"web-y","container":"web"},"values":[["1700000001000000000","hit from 2001:db8::5 Bearer sk-secret-xyz"]]},
			{"stream":{"namespace":"gipc","pod":"core-x","container":"core"},"values":[["1700000002000000000","{\"level\":\"INFO\",\"msg\":\"request\",\"method\":\"GET\",\"path\":\"/system\",\"status\":200,\"ip\":\"203.0.113.9\"}"]]}
		]}}`))
	}))
	defer lokiSrv.Close()

	rec := httptest.NewRecorder()
	// attacker tries to widen the query — must be ignored
	logsHandler(loki.New(lokiSrv.URL))(rec, httptest.NewRequest("GET", `/api/logs?query={namespace=~".%2B"}`, nil))

	if sawQuery != logsQuery {
		t.Fatalf("upstream query=%q, want fixed %q (client injection must be ignored)", sawQuery, logsQuery)
	}
	var resp LogsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Source != "loki" || len(resp.Lines) != 2 {
		t.Fatalf("want source loki + 2 lines, got %s / %d", resp.Source, len(resp.Lines))
	}
	if resp.Lines[0].Pod != "core-x" {
		t.Fatalf("newest-first ordering broken: first pod=%q", resp.Lines[0].Pod)
	}
	blob := rec.Body.String()
	for _, leak := range []string{"203.0.113.9", "2001:db8::5", "sk-secret-xyz"} {
		if strings.Contains(blob, leak) {
			t.Fatalf("secret/IP leaked into /api/logs response: %q", leak)
		}
	}
}

// TestLogsHandlerLokiDown: upstream error → 200 with source "unavailable" (never hard-fails).
func TestLogsHandlerLokiDown(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	srv.Close()
	rec := httptest.NewRecorder()
	logsHandler(loki.New(srv.URL))(rec, httptest.NewRequest("GET", "/api/logs", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code %d, want 200", rec.Code)
	}
	var resp LogsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Source != "unavailable" || len(resp.Lines) != 0 {
		t.Fatalf("want unavailable/0 lines, got %s/%d", resp.Source, len(resp.Lines))
	}
}
