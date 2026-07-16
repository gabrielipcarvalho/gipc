package server

// /api/lab/db/* — the Lab DB explorer. SAFE-BY-CONSTRUCTION: the request carries an id, never SQL;
// the ONLY statements that can execute are the fixed allowlist below, verbatim — displayed SQL ==
// executed SQL == EXPLAINed SQL. The target is the DISPOSABLE demo-ns toy postgres (synthetic
// dataset, SELECT-only role), never the ns-data prod DB. Defense layers: allowlist (hard), demo_ro
// SELECT-only grants (hard), read-only/2s-timeout role GUCs (belt), 3s handler ctx, LIMIT baked
// into every query text plus a Go-side 50-row scan cap.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/lib/pq"
)

type labQuery struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	SQL   string `json:"sql"`
	Note  string `json:"note"`
}

// labQueries is the FIXED allowlist — every entry ends without `;` and carries its own LIMIT
// (pinned by tests). Two executions per run: EXPLAIN ANALYZE + the rows. Synthetic demo dataset.
// Recency anchors are ROUTE-SCOPED `max(ts)` subselects: they ride idx_requests_route_ts as a
// sub-ms Index Only Scan InitPlan (a bare `max(ts)` has no ts-only index → an 80ms+ hidden seq
// scan that inverted the index-vs-seq exhibit — QA r2). Uniform synthetic data ⇒ any route's
// max ≈ the global max, so the anchor stays honest while the queries never time-decay.
var labQueries = []labQuery{
	{
		ID:    "idx-scan",
		Title: "index scan — recent hits on one route",
		SQL: `SELECT ts, route, status, latency_ms
FROM requests
WHERE route = '/api/status'
  AND ts > (SELECT max(ts) - interval '7 days' FROM requests WHERE route = '/api/status')
ORDER BY ts DESC
LIMIT 20`,
		Note: "walks idx_requests_route_ts backwards — compare with the seq scan twin",
	},
	{
		ID:    "seq-scan",
		Title: "seq scan — unanchored LIKE on the same column",
		SQL: `SELECT ts, route, status, latency_ms
FROM requests
WHERE route LIKE '%status%'
ORDER BY ts DESC
LIMIT 20`,
		Note: "the '%…%' pattern defeats the index → full 150k-row scan; watch the timing gap",
	},
	{
		ID:    "group-by",
		Title: "aggregate — traffic by status code",
		SQL: `SELECT status, count(*) AS hits, round(avg(latency_ms)::numeric, 1) AS avg_ms
FROM requests
GROUP BY status
ORDER BY hits DESC
LIMIT 50`,
		Note: "HashAggregate over the whole table",
	},
	{
		ID:    "join",
		Title: "hash join — deploys per service tier",
		SQL: `SELECT s.name, s.tier, count(*) AS deploys, avg(d.duration_s)::int AS avg_s
FROM deploys d
JOIN services s ON s.name = d.service
GROUP BY s.name, s.tier
ORDER BY deploys DESC
LIMIT 10`,
		Note: "small dimension table hashed, fact table streamed through it",
	},
	{
		ID:    "window",
		Title: "window function — 3 slowest hits per route (last day)",
		SQL: `SELECT route, ts, latency_ms, rnk
FROM (
  SELECT route, ts, latency_ms,
         rank() OVER (PARTITION BY route ORDER BY latency_ms DESC) AS rnk
  FROM requests
  WHERE ts > (SELECT max(ts) - interval '1 day' FROM requests WHERE route = '/')
) ranked
WHERE rnk <= 3
ORDER BY route, rnk
LIMIT 30`,
		Note: "WindowAgg + subquery filter",
	},
	{
		ID:    "top-n",
		Title: "top-N — 10 slowest requests ever",
		SQL: `SELECT ts, route, status, latency_ms
FROM requests
ORDER BY latency_ms DESC
LIMIT 10`,
		Note: "ORDER BY + LIMIT → top-N heapsort instead of a full sort",
	},
}

const (
	dbRunTimeout = 3 * time.Second
	dbRowCap     = 50
)

// dbRunResult is the wire shape for a successful run (timedOut is a legitimate exhibit outcome —
// never an `error` body on a 200).
type dbRunResult struct {
	ID         string          `json:"id"`
	Columns    []string        `json:"columns"`
	Rows       [][]string      `json:"rows"`
	RowsCapped bool            `json:"rowsCapped"`
	Plan       json.RawMessage `json:"plan"`
	ExecMs     float64         `json:"execMs"`
	TimedOut   bool            `json:"timedOut"`
}

// dbRunner is the narrow test seam (the podKiller pattern). The prod impl is pgRunner.
type dbRunner interface {
	Run(ctx context.Context, sqlText string) (*dbRunResult, error)
}

// errDBBusy distinguishes pool/deadline saturation from a dead DB (different honest states).
var errDBBusy = errors.New("db busy")

// pgRunner executes against the demo DB via database/sql + lib/pq. The pool is lazy — sql.Open
// never dials, so boot independence holds with the DB (or the Secret) absent.
type pgRunner struct {
	url  string
	once sync.Once
	db   *sql.DB
	err  error
}

func newPGRunner(url string) *pgRunner { return &pgRunner{url: url} }

func (p *pgRunner) get() (*sql.DB, error) {
	p.once.Do(func() {
		db, err := sql.Open("postgres", p.url)
		if err != nil {
			p.err = err
			return
		}
		db.SetMaxOpenConns(2) // the GLOBAL concurrency ceiling for the explorer
		db.SetMaxIdleConns(1)
		db.SetConnMaxIdleTime(5 * time.Minute)
		p.db = db
	})
	return p.db, p.err
}

// isStmtTimeout reports whether err is postgres SQLSTATE 57014 (statement_timeout / cancel).
func isStmtTimeout(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "57014"
}

func (p *pgRunner) Run(ctx context.Context, sqlText string) (*dbRunResult, error) {
	db, err := p.get()
	if err != nil {
		return nil, err
	}
	out := &dbRunResult{Columns: []string{}, Rows: [][]string{}}

	// 1) the plan — EXPLAIN ANALYZE of the exact allowlisted text (server-fixed concat, never user input)
	var planStr string
	err = db.QueryRowContext(ctx, "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+sqlText).Scan(&planStr)
	switch {
	case err == nil:
		out.Plan = json.RawMessage(planStr)
	case isStmtTimeout(err):
		out.TimedOut = true
		return out, nil
	case ctx.Err() != nil:
		return nil, errDBBusy
	default:
		return nil, err
	}

	// 2) the rows — same text, wall-clocked; scan stops at the cap (belt over the baked-in LIMITs)
	start := time.Now()
	rows, err := db.QueryContext(ctx, sqlText)
	if err != nil {
		if isStmtTimeout(err) {
			out.TimedOut = true
			return out, nil
		}
		if ctx.Err() != nil {
			return nil, errDBBusy
		}
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out.Columns = cols
	for rows.Next() {
		if len(out.Rows) >= dbRowCap {
			out.RowsCapped = true
			break
		}
		raw := make([]sql.NullString, len(cols))
		ptrs := make([]any, len(cols))
		for i := range raw {
			ptrs[i] = &raw[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := make([]string, len(cols))
		for i, v := range raw {
			if v.Valid {
				row[i] = v.String
			} else {
				row[i] = "∅"
			}
		}
		out.Rows = append(out.Rows, row)
	}
	if err := rows.Err(); err != nil && !out.RowsCapped {
		if isStmtTimeout(err) {
			out.TimedOut = true
			return out, nil
		}
		return nil, err
	}
	out.ExecMs = float64(time.Since(start).Microseconds()) / 1000.0
	return out, nil
}

// labDBQueriesHandler serves the static allowlist — the exhibit's menu (the SQL text is public).
func labDBQueriesHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, labQueries)
	}
}

// labDBRunHandler executes one allowlisted query. runner == nil (no DEMO_DB_URL) → honest 503.
func labDBRunHandler(runner dbRunner, log *slog.Logger, labHub *hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if runner == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "db explorer offline"})
			return
		}
		var req struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad request"})
			return
		}
		var q *labQuery
		for i := range labQueries {
			if labQueries[i].ID == req.ID {
				q = &labQueries[i]
				break
			}
		}
		if q == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown query id"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), dbRunTimeout)
		defer cancel()
		res, err := runner.Run(ctx, q.SQL)
		if err != nil {
			if errors.Is(err, errDBBusy) {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "explorer busy"})
				return
			}
			// id only — never SQL results or the DSN. lib/pq runtime errors don't embed the DSN;
			// a malformed operator-supplied Secret could surface DSN fragments via a parse error,
			// but the documented generation produces plain hex (accepted residual).
			log.Warn("lab_db_run_failed", "id", q.ID, "err", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "db explorer offline"})
			return
		}
		res.ID = q.ID
		log.Info("lab_db_run", "id", q.ID, "timedOut", res.TimedOut)
		publishLabEvent(labHub, "db", fmt.Sprintf("ran %s", q.ID))
		writeJSON(w, http.StatusOK, res)
	}
}

// armDBRunner mirrors armKiller/armLister: the runner arms ONLY when the Lab master switch is on
// AND a DSN is configured — nil interface otherwise so the handler's honest-503 guard fires (no
// typed-nil trap). LAB_ENABLED=false must kill the WHOLE lab surface, this endpoint included.
func armDBRunner(labEnabled bool, url string) dbRunner {
	if !labEnabled || url == "" {
		return nil
	}
	return newPGRunner(url)
}
