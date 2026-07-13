"use client";

import { useEffect, useRef, useState } from "react";
import type { Telemetry } from "../../data/telemetry";
import type { Status, StatusMetric } from "../../data/status";
import { type DeployEvent, type DeployStage, DEPLOY_STAGES } from "../../data/deploys";
import { MetricPanel, type Metric } from "./MetricPanel";

/* /system dashboard. Metrics (SSE /api/stream) and the deploy feed (SSR /api/deploys + SSE `deploy`
   events) are REAL and LIVE. Topology + request-trace stay stub (30s /api/telemetry poll) until later
   phases. The SSE stream OWNS the severed/restored status line; telemetry-poll failures are silent. */
const STUB_POLL_MS = 30000;

function relTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function clampPct(v: number | null, max: number): number {
  if (v == null || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((v / max) * 100)));
}
function fixed(m: StatusMetric, digits: number): string {
  return m.ok && m.value != null ? m.value.toFixed(digits) : "—";
}
function statusToMetrics(s: Status): Metric[] {
  const m = s.metrics;
  const errPct = m.errorRate.ok && m.errorRate.value != null ? m.errorRate.value * 100 : null;
  return [
    { k: "req/s", v: fixed(m.reqPerSec, 2), pct: clampPct(m.reqPerSec.value, 20) },
    { k: "p99 latency", v: m.p99Ms.ok ? `${fixed(m.p99Ms, 1)} ms` : "—", pct: clampPct(m.p99Ms.value, 200) },
    { k: "error rate", v: errPct != null ? `${errPct.toFixed(2)}%` : "—", pct: clampPct(errPct, 5) },
    { k: "web cpu", v: m.cpuCores.ok ? `${fixed(m.cpuCores, 3)} cores` : "—", pct: clampPct(m.cpuCores.value, 1) },
    { k: "web mem", v: m.memMiB.ok ? `${fixed(m.memMiB, 0)} MiB` : "—", pct: clampPct(m.memMiB.value, 384) },
  ];
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

export function SystemDash({ initial, initialDeploys }: { initial: Status; initialDeploys: DeployEvent[] }) {
  const [status, setStatus] = useState<Status>(initial); // SSR-seeded → real numbers pre-hydration
  const [deployEvents, setDeployEvents] = useState<DeployEvent[]>(initialDeploys);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
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

    // stub topology/trace via a slow 30s poll (silent on failure)
    let telAc: AbortController | null = null;
    const pullTelemetry = async () => {
      telAc?.abort();
      const ac = new AbortController();
      telAc = ac;
      try {
        const res = await fetch("/api/telemetry", { cache: "no-store", signal: ac.signal });
        if (!res.ok || disposed) return;
        setTelemetry((await res.json()) as Telemetry);
      } catch {
        /* silent — SSE owns the status line */
      }
    };
    pullTelemetry();
    const telInterval = window.setInterval(() => {
      if (!document.hidden) pullTelemetry();
    }, STUB_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) pullTelemetry();
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
        <MetricPanel metrics={statusToMetrics(status)} countUp placeholder={false} />
      </section>

      {/* REAL deploy feed — SSR-seeded from /api/deploys, live via SSE `deploy` events */}
      <section className="sys-block" aria-label="Deploy feed">
        <h2 className="sys-h">deploy feed</h2>
        {deployRows.length ? (
          <ol className="deploys">
            {deployRows.map((r) => (
              <li key={r.sha} data-failed={r.failed || undefined}>
                <span className="deploy-subject">{r.subject}</span>
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

      {/* stub sections — topology / trace (from /api/telemetry) */}
      {telemetry ? (
        <>
          <section className="sys-block" aria-label="Service topology (placeholder)" data-placeholder="true">
            <h2 className="sys-h">topology</h2>
            {telemetry.services.length ? (
              <ul className="topo">
                {telemetry.services.map((s) => (
                  <li className="topo-node" key={s.name} data-status={s.status}>
                    <span className="pulse topo-dot" aria-hidden />
                    <span className="topo-name">{s.name}</span>
                    <span className="topo-state">{s.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sys-empty">no services registered</p>
            )}
          </section>

          <section className="sys-block" aria-label="Request trace (placeholder)" data-placeholder="true">
            <h2 className="sys-h">trace your request</h2>
            <ol className="trace" data-placeholder="true">
              {telemetry.trace.map((h) => (
                <li key={h.hop}>
                  <span className="trace-hop">{h.hop}</span>
                  <span className="trace-detail">{h.detail}</span>
                  <span className="trace-ms">{h.ms} ms</span>
                </li>
              ))}
            </ol>
            <p className="sys-note">sample trace — placeholder timings</p>
          </section>
        </>
      ) : (
        <div className="sys-skeleton" aria-hidden>
          <div className="skel" /><div className="skel" />
        </div>
      )}
    </div>
  );
}
