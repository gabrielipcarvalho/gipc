package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

// TestLabDBAllowlistInvariants pins the safety properties of every allowlisted query: unique ids,
// no statement separator, a baked-in LIMIT (unconditional — the table-driven assertion has no
// exemption branch), and SELECT-only text.
func TestLabDBAllowlistInvariants(t *testing.T) {
	if len(labQueries) != 6 {
		t.Fatalf("allowlist size = %d, want 6", len(labQueries))
	}
	seen := map[string]bool{}
	for _, q := range labQueries {
		if q.ID == "" || seen[q.ID] {
			t.Errorf("query id %q empty or duplicated", q.ID)
		}
		seen[q.ID] = true
		if strings.Contains(q.SQL, ";") {
			t.Errorf("query %s contains a statement separator", q.ID)
		}
		if !strings.Contains(q.SQL, "LIMIT") {
			t.Errorf("query %s has no baked-in LIMIT", q.ID)
		}
		if !strings.HasPrefix(strings.TrimSpace(q.SQL), "SELECT") {
			t.Errorf("query %s is not a SELECT", q.ID)
		}
		if q.Title == "" || q.Note == "" {
			t.Errorf("query %s missing title/note", q.ID)
		}
	}
}

func TestLabDBQueriesHandlerServesAllowlist(t *testing.T) {
	rec := httptest.NewRecorder()
	labDBQueriesHandler()(rec, httptest.NewRequest("GET", "/api/lab/db/queries", nil))
	var out []labQuery
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out) != len(labQueries) || out[0].SQL == "" {
		t.Fatalf("allowlist not served verbatim: %d entries", len(out))
	}
}

// fakeRunner records what SQL reached it — the injection test's tripwire.
type fakeRunner struct {
	gotSQL string
	res    *dbRunResult
	err    error
}

func (f *fakeRunner) Run(_ context.Context, sqlText string) (*dbRunResult, error) {
	f.gotSQL = sqlText
	return f.res, f.err
}

func postRun(t *testing.T, runner dbRunner, body string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/lab/db/run", strings.NewReader(body))
	labDBRunHandler(runner, discardLog(), newHub())(rec, req)
	return rec
}

func TestLabDBRunNilRunnerHonest503(t *testing.T) {
	rec := postRun(t, nil, `{"id":"idx-scan"}`)
	if rec.Code != 503 || !strings.Contains(rec.Body.String(), "db explorer offline") {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestLabDBRunUnknownID404(t *testing.T) {
	f := &fakeRunner{res: &dbRunResult{}}
	rec := postRun(t, f, `{"id":"nope"}`)
	if rec.Code != 404 {
		t.Fatalf("code=%d", rec.Code)
	}
	if f.gotSQL != "" {
		t.Fatal("runner must never be reached for an unknown id")
	}
}

// TestLabDBRunSQLNeverFromRequest is the injection tripwire: a request smuggling SQL alongside a
// valid id must execute EXACTLY the allowlisted text.
func TestLabDBRunSQLNeverFromRequest(t *testing.T) {
	f := &fakeRunner{res: &dbRunResult{Columns: []string{}, Rows: [][]string{}}}
	rec := postRun(t, f, `{"id":"top-n","sql":"DROP TABLE requests","q":"DELETE FROM deploys"}`)
	if rec.Code != 200 {
		t.Fatalf("code=%d", rec.Code)
	}
	want := ""
	for _, q := range labQueries {
		if q.ID == "top-n" {
			want = q.SQL
		}
	}
	if f.gotSQL != want {
		t.Fatalf("executed SQL diverged from the allowlist:\n%s", f.gotSQL)
	}
	if strings.Contains(f.gotSQL, "DROP") || strings.Contains(f.gotSQL, "DELETE") {
		t.Fatal("request-supplied SQL reached the runner")
	}
}

func TestLabDBRunBadBody400(t *testing.T) {
	rec := postRun(t, &fakeRunner{}, `{bad json`)
	if rec.Code != 400 {
		t.Fatalf("code=%d", rec.Code)
	}
}

func TestLabDBRunSuccessShape(t *testing.T) {
	f := &fakeRunner{res: &dbRunResult{
		Columns: []string{"a"}, Rows: [][]string{{"1"}}, Plan: json.RawMessage(`[{"Plan":{}}]`), ExecMs: 1.5,
	}}
	rec := postRun(t, f, `{"id":"group-by"}`)
	if rec.Code != 200 {
		t.Fatalf("code=%d", rec.Code)
	}
	var out dbRunResult
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.ID != "group-by" || len(out.Rows) != 1 || out.Plan == nil {
		t.Fatalf("%+v", out)
	}
}

// TestLabDBRunTimeoutIs200 — a statement_timeout is a legitimate exhibit outcome, not an error
// body: 200 with timedOut=true (house wire convention keeps `error` bodies on non-200 only).
func TestLabDBRunTimeoutIs200(t *testing.T) {
	f := &fakeRunner{res: &dbRunResult{Columns: []string{}, Rows: [][]string{}, TimedOut: true}}
	rec := postRun(t, f, `{"id":"seq-scan"}`)
	if rec.Code != 200 {
		t.Fatalf("code=%d", rec.Code)
	}
	var out dbRunResult
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if !out.TimedOut {
		t.Fatal("timedOut not surfaced")
	}
	if strings.Contains(rec.Body.String(), `"error"`) {
		t.Fatal("error body on a 200")
	}
}

func TestLabDBRunBusyVsDown(t *testing.T) {
	busy := postRun(t, &fakeRunner{err: errDBBusy}, `{"id":"join"}`)
	if busy.Code != 503 || !strings.Contains(busy.Body.String(), "explorer busy") {
		t.Fatalf("busy: code=%d body=%s", busy.Code, busy.Body.String())
	}
	down := postRun(t, &fakeRunner{err: errors.New("dial tcp: connection refused")}, `{"id":"join"}`)
	if down.Code != 503 || !strings.Contains(down.Body.String(), "db explorer offline") {
		t.Fatalf("down: code=%d body=%s", down.Code, down.Body.String())
	}
}

// TestArmDBRunner mirrors the armKiller gating tests: the runner arms only with the Lab master
// switch on AND a DSN — LAB_ENABLED=false must kill this endpoint too (the QA-guarded regression).
func TestArmDBRunner(t *testing.T) {
	if armDBRunner(true, "") != nil {
		t.Fatal("empty DSN must yield a nil runner")
	}
	if armDBRunner(false, "postgres://x") != nil {
		t.Fatal("lab disabled must yield a nil runner even with a DSN")
	}
	if armDBRunner(true, "postgres://x") == nil {
		t.Fatal("lab enabled + DSN must arm the runner")
	}
}

// TestLabDBRunOversizeBody400 pins the MaxBytesReader cap (1 KiB).
func TestLabDBRunOversizeBody400(t *testing.T) {
	big := `{"id":"` + strings.Repeat("x", 2048) + `"}`
	rec := postRun(t, &fakeRunner{}, big)
	if rec.Code != 400 {
		t.Fatalf("code=%d", rec.Code)
	}
}

// TestLabDBRunLimiterWired pins the route wiring: with a zero-token dbLimiter the POST must 429
// before the handler runs, while GET /queries (global limiter only) stays 200.
func TestLabDBRunLimiterWired(t *testing.T) {
	t.Setenv("DB_RPS", "0")
	t.Setenv("DB_BURST", "0")
	cfg, _ := config.Load()
	h, _ := New(cfg, discardLog(), context.Background())

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/api/lab/db/run", strings.NewReader(`{"id":"top-n"}`)))
	if rec.Code != 429 {
		t.Fatalf("POST /run with zero-token limiter: code=%d want 429", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/db/queries", nil))
	if rec.Code != 200 {
		t.Fatalf("GET /queries must not ride the db limiter: code=%d", rec.Code)
	}
}
