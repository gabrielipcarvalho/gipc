"use client";

import { useEffect, useRef, useState } from "react";
import type { Telemetry, TelemetryDeploy } from "../../data/telemetry";
import { MetricPanel, type Metric } from "./MetricPanel";

/* /system dashboard — polls the stub telemetry API every 5s. Server-renders a
   deterministic skeleton; all values arrive client-side (zero hydration surface).
   Error keeps last-good data visible and auto-recovers; refreshes are silent to
   screen readers (only the error/recovery line is announced via the persistent
   status node). */
const POLL_MS = 5000;

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

function toMetrics(t: Telemetry): Metric[] {
  return t.services.map((s) => ({
    k: s.name,
    // stub visual: quicker services fill more of the bar
    pct: Math.max(8, Math.min(96, Math.round(100 - Math.log10(s.latencyMs + 1) * 32))),
    v: `${s.latencyMs} ms · ${s.rps} rps`,
  }));
}

export function SystemDash() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [deploys, setDeploys] = useState<DeployView[]>([]);
  // status line: "" (quiet) | severed | restored — a live region only announces
  // ADDED text, so recovery must write a message, not clear one
  const [statusMsg, setStatusMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const hadErrorRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const pull = async () => {
      abortRef.current?.abort(); // newest request wins — no stale clobber
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch("/api/telemetry", { cache: "no-store", signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const t = (await res.json()) as Telemetry;
        if (disposed) return;
        const now = Date.now(); // fetch time, never render time
        setData(t);
        setDeploys(t.deploys.map((d) => ({ ...d, rel: relTime(d.when, now) })));
        if (hadErrorRef.current) {
          hadErrorRef.current = false;
          setStatusMsg("telemetry link restored"); // stays rendered; identical swaps are silent
        }
      } catch (err) {
        if (disposed || (err as Error)?.name === "AbortError") return;
        hadErrorRef.current = true;
        setStatusMsg("telemetry link severed — re-scrying…"); // last-good data stays rendered
      }
    };
    pull();
    // single interval, armed once; ticks no-op while the tab is hidden
    const interval = window.setInterval(() => {
      if (!document.hidden) pull();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) pull(); // immediate refresh on return
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="sys" data-placeholder="true">
      {/* persistent status node — text swaps on error/recovery, refreshes stay silent */}
      <p
        className="sys-status"
        role="status"
        data-severed={statusMsg.includes("severed") || undefined}
      >
        {statusMsg}
      </p>

      {!data && !statusMsg && (
        <div className="sys-skeleton" aria-hidden>
          <div className="skel" /><div className="skel" /><div className="skel" />
        </div>
      )}

      {data && (
        <>
          <section className="sys-block" aria-label="Service topology (placeholder)">
            <h2 className="sys-h">topology</h2>
            {data.services.length ? (
              <ul className="topo">
                {data.services.map((s) => (
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

          <section className="sys-block" aria-label="Service metrics (placeholder)">
            <h2 className="sys-h">metrics</h2>
            <MetricPanel metrics={toMetrics(data)} countUp />
          </section>

          <section className="sys-block" aria-label="Deploy feed (placeholder)">
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
            <p className="sys-note">placeholder — real deploy commits land with the telemetry backend</p>
          </section>

          <section className="sys-block" aria-label="Request trace (placeholder)">
            <h2 className="sys-h">trace your request</h2>
            <ol className="trace" data-placeholder="true">
              {data.trace.map((h) => (
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
      )}
    </div>
  );
}
