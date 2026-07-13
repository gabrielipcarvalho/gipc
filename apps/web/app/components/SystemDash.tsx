"use client";

import { useEffect, useRef, useState } from "react";
import type { Telemetry, TelemetryDeploy } from "../../data/telemetry";
import type { Status, StatusMetric } from "../../data/status";
import { MetricPanel, type Metric } from "./MetricPanel";

/* /system dashboard. Metrics are REAL and LIVE over SSE (/api/stream, SSR-seeded from `initial`).
   Topology/deploy-feed/trace stay stub — a slow 30s /api/telemetry poll (kept fresh + self-healing)
   until later phases. The SSE stream OWNS the severed/restored status line; telemetry-poll failures
   are silent (keep last-good) so a stale "restored" can't hide a down stream. */
const STUB_POLL_MS = 30000;

type DeployView = TelemetryDeploy & { rel: string };

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

/* The 5 real metrics → MetricPanel rows. Values honest ("—" when unavailable); bars decorative. */
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

export function SystemDash({ initial }: { initial: Status }) {
  const [status, setStatus] = useState<Status>(initial); // SSR-seeded → real numbers pre-hydration
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [deploys, setDeploys] = useState<DeployView[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const hadErrorRef = useRef(false);
  const backoffRef = useRef(3000);

  useEffect(() => {
    let disposed = false;
    let es: EventSource | null = null;
    let reopenTimer: number | null = null;

    // --- metrics via SSE (owns the status line) ---
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
          restored();
        } catch {
          /* ignore a malformed frame */
        }
      });
      es.onopen = restored;
      es.onerror = () => {
        hadErrorRef.current = true;
        setStatusMsg("telemetry link severed — re-scrying…"); // last-good numbers stay rendered
        // EventSource auto-reconnects transient network drops (readyState CONNECTING) — leave those.
        // Only take over when it has GIVEN UP (CLOSED — e.g. an HTTP 503/5xx), with capped backoff.
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

    // --- stub topology/deploy/trace via a slow 30s poll (silent on failure) ---
    let telAc: AbortController | null = null;
    const pullTelemetry = async () => {
      telAc?.abort();
      const ac = new AbortController();
      telAc = ac;
      try {
        const res = await fetch("/api/telemetry", { cache: "no-store", signal: ac.signal });
        if (!res.ok || disposed) return;
        const t = (await res.json()) as Telemetry;
        if (disposed) return;
        const now = Date.now(); // fetch time, never render time
        setTelemetry(t);
        setDeploys(t.deploys.map((d) => ({ ...d, rel: relTime(d.when, now) })));
      } catch {
        /* silent — SSE owns the status line; keep last-good stub data */
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

  return (
    <div className="sys">
      <p className="sys-status" role="status" data-severed={statusMsg.includes("severed") || undefined}>
        {statusMsg}
      </p>

      {/* REAL metrics — always rendered (SSR carries the initial numbers, SSE updates them live) */}
      <section className="sys-block" aria-label="Platform metrics">
        <h2 className="sys-h">metrics</h2>
        <p className="sys-source">
          source: {status.source === "prometheus" ? "prometheus · live" : "unavailable — re-scrying"}
        </p>
        <MetricPanel metrics={statusToMetrics(status)} countUp placeholder={false} />
      </section>

      {/* stub sections — topology / deploy feed / trace (from /api/telemetry) */}
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

          <section className="sys-block" aria-label="Deploy feed (placeholder)" data-placeholder="true">
            <h2 className="sys-h">deploy feed</h2>
            {deploys.length ? (
              <ol className="deploys">
                {deploys.map((d) => (
                  <li key={d.id}>
                    <span className="deploy-subject">{d.subject}</span>
                    <span className="deploy-when">{d.rel}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sys-empty">no deploys recorded — feed idle</p>
            )}
            <p className="sys-note">placeholder — real deploy commits land with the deploy-feed phase</p>
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
        !statusMsg && (
          <div className="sys-skeleton" aria-hidden>
            <div className="skel" /><div className="skel" /><div className="skel" />
          </div>
        )
      )}
    </div>
  );
}
