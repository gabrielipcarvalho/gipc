"use client";

import { useEffect, useRef, useState } from "react";
import type { Topology } from "../../data/topology";
import type { Status } from "../../data/status";
import { statusToMetrics } from "../../data/statusMetrics";
import { type DeployEvent, type DeployStage, DEPLOY_STAGES } from "../../data/deploys";
import {
  type MetricsHistory,
  type LogsResponse,
  type RequestTrace,
  type Point,
  HISTORY_PANELS,
} from "../../data/observability";
import { MetricPanel, type Metric } from "./MetricPanel";
import { Sparkline } from "./Sparkline";
import { DeepPanels } from "./DeepPanels";
import type { DeepResponse, VolumeResponse } from "../../data/deep";

/* /system dashboard. Metrics (SSE /api/stream), the deploy feed (SSR + SSE `deploy`), the 30m history
   sparklines, the redacted log stream and the per-visitor request trace are all REAL and LIVE. Only the
   service topology is real (30s /api/topology poll — pod truth from core's k8s reads);
   the deep-scry panels (DeepPanels) run their displayed queries verbatim. The SSE stream OWNS the severed/restored status
   line; the observability polls fail silently. */
const TOPOLOGY_POLL_MS = 30000;
const HISTORY_POLL_MS = 15000;
const LOGS_POLL_MS = 10000;

function relTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}


/* Client-side idempotent merge per (sha,stage) with the same ts replay-guard as the server. */
function mergeDeploy(list: DeployEvent[], ev: DeployEvent): DeployEvent[] {
  const i = list.findIndex((e) => e.sha === ev.sha && e.stage === ev.stage);
  if (i < 0) return [...list, ev];
  if (ev.ts < list[i].ts || (list[i].status === ev.status && list[i].ts === ev.ts)) return list;
  const out = list.slice();
  out[i] = ev;
  return out;
}

type DeployRow = { sha: string; subject: string; ts: string; reached: Set<DeployStage>; failed: boolean };
function groupDeploys(events: DeployEvent[]): DeployRow[] {
  const bySha = new Map<string, DeployRow>();
  for (const e of events) {
    let row = bySha.get(e.sha);
    if (!row) {
      row = { sha: e.sha, subject: e.subject || e.sha.slice(0, 7), ts: e.ts, reached: new Set(), failed: false };
      bySha.set(e.sha, row);
    }
    if (e.subject) row.subject = e.subject;
    if (e.ts > row.ts) row.ts = e.ts;
    if (e.status === "success") row.reached.add(e.stage);
    if (e.status === "failure") row.failed = true;
  }
  return Array.from(bySha.values()).sort((a, b) => b.ts.localeCompare(a.ts));
}


function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1) return `${Math.round(ms * 1000)} µs`;
  return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
}

export function SystemDash({
  initial,
  initialDeploys,
  initialHistory,
  initialDeep,
  initialVolume,
}: {
  initial: Status;
  initialDeploys: DeployEvent[];
  initialHistory: MetricsHistory;
  initialDeep: DeepResponse | null;
  initialVolume: VolumeResponse | null;
}) {
  const [status, setStatus] = useState<Status>(initial); // SSR-seeded → real numbers pre-hydration
  const [deployEvents, setDeployEvents] = useState<DeployEvent[]>(initialDeploys);
  const [history, setHistory] = useState<MetricsHistory>(initialHistory);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [trace, setTrace] = useState<RequestTrace | null>(null);
  const [traceFailed, setTraceFailed] = useState(false); // distinguish failed from still-loading (honest copy)
  const [topology, setTopology] = useState<Topology | null>(null);
  const [topoFailed, setTopoFailed] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [now, setNow] = useState<number | null>(null); // null on SSR → relative times fill in post-mount (no hydration mismatch)
  const hadErrorRef = useRef(false);
  const backoffRef = useRef(3000);

  useEffect(() => {
    let disposed = false;
    let es: EventSource | null = null;
    let reopenTimer: number | null = null;
    setNow(Date.now());

    const restored = () => {
      backoffRef.current = 3000;
      if (hadErrorRef.current) {
        hadErrorRef.current = false;
        setStatusMsg("telemetry link restored");
      }
    };
    const openStream = () => {
      if (disposed) return;
      es = new EventSource("/api/stream");
      es.addEventListener("metrics", (e) => {
        if (disposed) return;
        try {
          setStatus(JSON.parse((e as MessageEvent).data) as Status);
          setNow(Date.now());
          restored();
        } catch {
          /* ignore malformed frame */
        }
      });
      es.addEventListener("deploy", (e) => {
        if (disposed) return;
        try {
          setDeployEvents((prev) => mergeDeploy(prev, JSON.parse((e as MessageEvent).data) as DeployEvent));
        } catch {
          /* ignore malformed frame */
        }
      });
      es.onopen = restored;
      es.onerror = () => {
        hadErrorRef.current = true;
        setStatusMsg("telemetry link severed — re-scrying…");
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          const delay = backoffRef.current;
          backoffRef.current = Math.min(30000, delay * 2);
          reopenTimer = window.setTimeout(openStream, delay);
        }
      };
    };
    openStream();

    // REAL topology via a slow 30s poll (pods change slowly). Failures set topoFailed → an honest
    // 'unavailable' section when no prior truth exists; existing truth is kept, never invented.
    let telAc: AbortController | null = null;
    const pullTopology = async () => {
      telAc?.abort();
      const ac = new AbortController();
      telAc = ac;
      try {
        const res = await fetch("/api/topology", { cache: "no-store", signal: ac.signal });
        if (disposed) return;
        if (!res.ok) {
          setTopoFailed(true); // honest state — a skeleton must not shimmer forever on a 503/404
          return;
        }
        setTopoFailed(false);
        setTopology((await res.json()) as Topology);
      } catch {
        if (!disposed) setTopoFailed(true);
      }
    };
    pullTopology();
    const telInterval = window.setInterval(() => {
      if (!document.hidden) pullTopology();
    }, TOPOLOGY_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) pullTopology();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      es?.close();
      if (reopenTimer) clearTimeout(reopenTimer);
      clearInterval(telInterval);
      telAc?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Observability polls: history (15s), logs (10s), trace (once). All silent on failure — the SSE
  // owns the status line, and each surface degrades to its own honest empty/unavailable state.
  useEffect(() => {
    let disposed = false;
    const acs = new Set<AbortController>();
    const pull = async <T,>(url: string, apply: (d: T) => void) => {
      const ac = new AbortController();
      acs.add(ac);
      try {
        const res = await fetch(url, { cache: "no-store", signal: ac.signal });
        if (!res.ok || disposed) return;
        apply((await res.json()) as T);
      } catch {
        /* silent */
      } finally {
        acs.delete(ac);
      }
    };
    const pullHistory = () => pull<MetricsHistory>("/api/metrics/history", setHistory);
    const pullLogs = () => pull<LogsResponse>("/api/logs", setLogs);
    // trace: the visitor's real path — fetched once; track failed vs still-loading so the copy stays honest
    (async () => {
      const ac = new AbortController();
      acs.add(ac);
      try {
        const res = await fetch("/api/trace", { cache: "no-store", signal: ac.signal });
        if (disposed) return;
        if (!res.ok) throw new Error("trace unavailable");
        setTrace((await res.json()) as RequestTrace);
      } catch {
        if (!disposed) setTraceFailed(true);
      } finally {
        acs.delete(ac);
      }
    })();
    pullHistory();
    pullLogs();
    const hi = window.setInterval(() => {
      if (!document.hidden) pullHistory();
    }, HISTORY_POLL_MS);
    const li = window.setInterval(() => {
      if (!document.hidden) pullLogs();
    }, LOGS_POLL_MS);
    return () => {
      disposed = true;
      acs.forEach((c) => c.abort());
      clearInterval(hi);
      clearInterval(li);
    };
  }, []);

  const deployRows = groupDeploys(deployEvents);

  return (
    <div className="sys">
      <p className="sys-status" role="status" data-severed={statusMsg.includes("severed") || undefined}>
        {statusMsg}
      </p>

      {/* REAL metrics — SSR-seeded, SSE-updated */}
      <section className="sys-block" aria-label="Platform metrics">
        <h2 className="sys-h">metrics</h2>
        <p className="sys-source">
          source: {status.source === "prometheus" ? "prometheus · live" : "unavailable — re-scrying"}
        </p>
        <MetricPanel metrics={statusToMetrics(status)} countUp />
      </section>

      {/* REAL history — 30m aggregate range series rendered as native sparklines */}
      <section className="sys-block" aria-label="Metrics history">
        <h2 className="sys-h">history · 30m</h2>
        <p className="sys-source">
          source: {history.source === "prometheus" ? "prometheus range · live" : "unavailable"}
        </p>
        <ul className="sparks">
          {HISTORY_PANELS.map((p) => {
            const pts = history.series[p.key] ?? [];
            const latest = pts.length ? pts[pts.length - 1].v : null;
            return (
              <li className="spark-row" key={p.key}>
                <span className="spark-k">{p.label}</span>
                <Sparkline points={pts} />
                <span className="spark-v">
                  {latest != null ? `${latest.toFixed(p.digits)}${p.unit ? ` ${p.unit}` : ""}` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* REAL deploy feed — SSR-seeded from /api/deploys, live via SSE `deploy` events */}
      <section className="sys-block" aria-label="Deploy feed">
        <h2 className="sys-h">deploy feed</h2>
        {deployRows.length ? (
          <ol className="deploys">
            {deployRows.map((r) => (
              <li key={r.sha} data-failed={r.failed || undefined}>
                <span className="deploy-subject">{r.subject}</span>
                {r.failed && (
                  <span className="deploy-mark" aria-hidden>
                    ✗ failed
                  </span>
                )}
                {/* accessible twin of the aria-hidden colour track: state as text, not colour */}
                <span className="sr-only">
                  {r.reached.size
                    ? `reached ${DEPLOY_STAGES.filter((s) => r.reached.has(s)).join(", ")}`
                    : "no stages reached"}
                  {r.failed ? "; deploy failed" : ""}
                </span>
                <span className="deploy-track" aria-hidden>
                  {DEPLOY_STAGES.map((st) => (
                    <span key={st} className="deploy-stage" data-on={r.reached.has(st) || undefined}>
                      {st}
                    </span>
                  ))}
                </span>
                <span className="deploy-when">{now ? relTime(r.ts, now) : ""}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="sys-empty">no deploys recorded yet — a push to main lights the feed</p>
        )}
      </section>

      {/* REAL logs — redacted tail of the platform's own pods (ns=gipc), fixed server-side query */}
      <section className="sys-block" aria-label="Platform logs">
        <h2 className="sys-h">logs</h2>
        <p className="sys-source">
          source: {logs?.source === "loki" ? "loki · ns=gipc · redacted" : logs ? "unavailable" : "scrying…"}
        </p>
        {logs && logs.lines.length ? (
          <ol className="logstream">
            {logs.lines.map((l, i) => (
              <li key={`${l.ts}-${i}`} data-level={l.level.toLowerCase() || undefined}>
                <span className="log-pod">{l.pod}</span>
                {["ERROR", "WARN"].includes(l.level.toUpperCase()) && (
                  <span className="log-level">[{l.level.toLowerCase()}]</span>
                )}
                <span className="log-msg">{l.msg}</span>
                <span className="log-when">{now ? relTime(l.ts, now) : ""}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="sys-empty">{logs ? "no recent log lines" : "reading the platform’s logs…"}</p>
        )}
      </section>

      {/* REAL request trace — the actual path THIS request took (client-fetched on mount) */}
      <section className="sys-block" aria-label="Request trace">
        <h2 className="sys-h">trace your request</h2>
        {trace ? (
          <>
            <ol className="trace">
              {trace.hops.map((h) => (
                <li key={h.name}>
                  <span className="trace-hop">{h.name}</span>
                  <span className="trace-detail">{h.detail}</span>
                  <span className="trace-ms" data-measured={h.measured || undefined}>
                    {fmtMs(h.ms)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="sys-note">
              {trace.edge.colo
                ? `edge PoP ${trace.edge.colo}${trace.edge.country ? ` · ${trace.edge.country}` : ""} — `
                : ""}
              real path; only the core-handler time is measured
              {trace.requestId ? ` · req ${trace.requestId}` : ""}
            </p>
          </>
        ) : traceFailed ? (
          <p className="sys-empty">trace unavailable — core unreachable</p>
        ) : (
          <p className="sys-empty">scrying your route…</p>
        )}
      </section>

      {/* REAL topology — live pod truth from core's k8s reads */}
      {!topology && topoFailed ? (
        <section className="sys-block" aria-label="Service topology">
          <h2 className="sys-h">topology</h2>
          <p className="sys-empty">topology unavailable — re-scrying…</p>
        </section>
      ) : topology ? (
        <section className="sys-block" aria-label="Service topology">
          <h2 className="sys-h">topology</h2>
          {topology.services.length ? (
            <ul className="topo">
              {topology.services.map((s) => (
                <li className="topo-node" key={s.name} data-status={s.status}>
                  <span className="pulse topo-dot" aria-hidden />
                  <span className="topo-name">{s.name}</span>
                  <span className="topo-state">{s.status}</span>
                  <span className="topo-pods">
                    {s.pods.map((p) => (
                      <span className="topo-pod" key={p.name}>
                        {p.restarts > 0 && (
                          <b className="topo-restarts">
                            <span className="sr-only">restarts </span>↻{p.restarts}
                          </b>
                        )}
                        {p.commitUrl ? (
                          <a href={p.commitUrl} target="_blank" rel="noreferrer">
                            {p.imageShort}
                            <span className="sr-only"> (commit, opens in new tab)</span>
                          </a>
                        ) : (
                          <i>{p.imageShort}</i>
                        )}
                        {(p.requests || p.limits) && (
                          <em className="topo-res">
                            {p.requests && `req ${p.requests}`}
                            {p.requests && p.limits && " / "}
                            {p.limits && `lim ${p.limits}`}
                          </em>
                        )}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sys-empty">no services registered</p>
          )}
        </section>
      ) : (
        <div className="sys-skeleton" aria-hidden>
          <div className="skel" />
        </div>
      )}

      <DeepPanels initialDeep={initialDeep} initialVolume={initialVolume} />
    </div>
  );
}
