"use client";

import { useEffect, useRef, useState } from "react";
import type { DbQuery, DbRunResult, PlanNode } from "../../data/lab";

/* The Lab DB explorer — run one of six allowlisted queries against the DISPOSABLE demo-ns
   postgres (synthetic toy dataset — NOT the platform's real database) and see the real rows plus
   the real EXPLAIN (ANALYZE) plan tree. The SQL shown is the SQL that ran, verbatim; free-form
   input does not exist by design. States: offline (503) / busy / cooling (429) / timed-out /
   ready. aria-live announces terminal states (done/offline/busy/cooling) — the transient
   "running" message sits outside the live region so screen readers aren't chattered at. */

type RunState =
  | { kind: "idle" }
  | { kind: "running"; id: string }
  | { kind: "done"; res: DbRunResult }
  | { kind: "offline" }
  | { kind: "busy" }
  | { kind: "cooling" }
  | { kind: "error" };

export function DbExplorerPanel() {
  const [queries, setQueries] = useState<DbQuery[] | null>(null);
  const [menuFailed, setMenuFailed] = useState(false);
  const [sel, setSel] = useState<string>("");
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/lab/db/queries", { signal: ctrl.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const qs = (await res.json()) as DbQuery[];
        if (!disposed.current) {
          setQueries(qs);
          if (qs.length) setSel(qs[0].id);
        }
      } catch {
        if (!disposed.current) setMenuFailed(true);
      }
    })();
    return () => {
      disposed.current = true;
      ctrl.abort();
    };
  }, []);

  async function runQuery(id: string) {
    if (run.kind === "running") return;
    setSel(id);
    setRun({ kind: "running", id });
    try {
      const res = await fetch("/api/lab/db/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (disposed.current) return;
      if (res.ok) {
        const body = (await res.json()) as DbRunResult;
        if (!disposed.current) setRun({ kind: "done", res: body });
        return;
      }
      if (res.status === 429) {
        setRun({ kind: "cooling" });
        return;
      }
      if (res.status === 503) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setRun(b.error === "explorer busy" ? { kind: "busy" } : { kind: "offline" });
        return;
      }
      setRun({ kind: "error" });
    } catch {
      if (!disposed.current) setRun({ kind: "error" });
    }
  }

  const active = queries?.find((q) => q.id === sel);

  return (
    <section className="lab-panel" aria-labelledby="dbx-h">
      <h2 id="dbx-h" className="lab-h">
        DB explorer
      </h2>
      <p className="lab-lead">
        Run a curated query against a disposable demo postgres (namespace <code>demo</code> —
        synthetic dataset, <em>not</em> the platform&apos;s real database) and read the actual{" "}
        <code>EXPLAIN (ANALYZE)</code> plan. The SQL shown is exactly what runs — there is no
        free-form input, by design.
      </p>

      {menuFailed ? (
        <p className="lab-msg">query menu unavailable — the explorer needs the core service</p>
      ) : !queries ? (
        <p className="lab-msg">loading queries…</p>
      ) : (
        <>
          <div className="dbx-picker" role="group" aria-label="allowlisted queries">
            {queries.map((q) => (
              <button
                key={q.id}
                type="button"
                className={`dbx-pick ${sel === q.id ? "on" : ""}`}
                onClick={() => runQuery(q.id)}
                disabled={run.kind === "running"}
              >
                {q.title}
              </button>
            ))}
          </div>
          {active && (
            <>
              <code className="deep-q dbx-sql">{active.sql}</code>
              <p className="dbx-note">{active.note}</p>
            </>
          )}
          {run.kind === "running" && <p className="lab-msg">scrying the planner…</p>}
          <div aria-live="polite">
            {run.kind === "cooling" && <p className="lab-msg">cooling down — one query every 2s</p>}
            {run.kind === "busy" && <p className="lab-msg">explorer busy — try again in a moment</p>}
            {run.kind === "offline" && (
              <p className="lab-msg">db explorer offline — the demo database is resting</p>
            )}
            {run.kind === "error" && <p className="lab-msg">something went wrong — try again</p>}
            {run.kind === "done" && run.res.timedOut && (
              <p className="lab-msg">query timed out (2s statement cap / 3s request budget)</p>
            )}
            {run.kind === "done" && !run.res.timedOut && (
              <p className="lab-msg">
                {run.res.rows.length} row{run.res.rows.length === 1 ? "" : "s"} in{" "}
                {run.res.execMs.toFixed(1)} ms{run.res.rowsCapped ? " (capped at 50)" : ""}
              </p>
            )}
          </div>
          {run.kind === "done" && !run.res.timedOut && (
            <>
              {run.res.plan?.[0] && (
                <div className="dbx-plan">
                  <h3 className="dbx-h3">plan</h3>
                  {/* focusable scroller: deep trees overflow narrow viewports (house rule — wide
                      content scrolls in its own container, the page never scrolls sideways) */}
                  <div className="dbx-planwrap" tabIndex={0} role="region" aria-label="query plan">
                    <div className="dbx-plantree">
                      <PlanTree
                        node={run.res.plan[0].Plan}
                        total={run.res.plan[0].Plan["Actual Total Time"] ?? 0}
                        depth={0}
                      />
                    </div>
                  </div>
                  {typeof run.res.plan[0]["Execution Time"] === "number" && (
                    <p className="dbx-note">
                      planner {run.res.plan[0]["Planning Time"]?.toFixed(2)} ms · execution{" "}
                      {run.res.plan[0]["Execution Time"]?.toFixed(2)} ms
                    </p>
                  )}
                </div>
              )}
              {run.res.rows.length > 0 && (
                // tabIndex: keyboard users must be able to scroll the capped result region
                <div className="dbx-tablewrap" tabIndex={0} role="region" aria-label="query results">
                  <table className="dbx-table">
                    <thead>
                      <tr>
                        {run.res.columns.map((c) => (
                          <th key={c} scope="col">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {run.res.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((v, j) => (
                            <td key={j}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/* Recursive plan-tree row: node type, index/relation, actual time + rows, and a time-share bar
   (this node's actual total time vs the root's — inclusive of children, like EXPLAIN itself). */
function PlanTree({ node, total, depth }: { node: PlanNode; total: number; depth: number }) {
  const t = node["Actual Total Time"];
  const share = total > 0 && typeof t === "number" ? Math.min((t / total) * 100, 100) : 0;
  const target = node["Index Name"] ?? node["Relation Name"];
  return (
    <>
      <div className="dbx-node" style={{ paddingLeft: `${depth * 1.1}rem` }}>
        <span className="dbx-bar" aria-hidden>
          <span className="dbx-barfill" style={{ width: `${share.toFixed(1)}%` }} />
        </span>
        <span className="dbx-nodetype">{node["Node Type"]}</span>
        {target && <span className="dbx-target">on {target}</span>}
        <span className="dbx-nodestats">
          {typeof t === "number" ? `${t.toFixed(2)} ms` : "—"} ·{" "}
          {typeof node["Actual Rows"] === "number" ? `${node["Actual Rows"]} rows` : "—"}
          {typeof node["Actual Loops"] === "number" && node["Actual Loops"] > 1
            ? ` · ×${node["Actual Loops"]} loops`
            : ""}
        </span>
      </div>
      {node.Plans?.map((child, i) => (
        <PlanTree key={i} node={child} total={total} depth={depth + 1} />
      ))}
    </>
  );
}
