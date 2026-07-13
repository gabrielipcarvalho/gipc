"use client";

import { useEffect, useState } from "react";
import type { Uptime, Incident } from "../../data/uptime";

/* /status uptime board. SSR-seeded from /api/uptime, refreshed by a 30s poll. Per-target status +
   uptime% + latency + a bar-strip of recent samples; incident history below. `now` is null on SSR so
   relative times fill in post-mount (no hydration mismatch). No keyframes → reduced-motion trivial. */
const POLL_MS = 30000;

function relTime(iso: string, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtDur(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function incidentDur(i: Incident, now: number | null): string {
  if (i.durationS != null) return fmtDur(i.durationS);
  if (now == null) return "ongoing";
  return `ongoing · ${fmtDur(Math.max(0, Math.round((now - Date.parse(i.start)) / 1000)))}`;
}

export function StatusBoard({ initial }: { initial: Uptime }) {
  const [uptime, setUptime] = useState<Uptime>(initial);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    setNow(Date.now());
    let ac: AbortController | null = null;
    const pull = async () => {
      ac?.abort();
      const c = new AbortController();
      ac = c;
      try {
        const res = await fetch("/api/uptime", { cache: "no-store", signal: c.signal });
        if (!res.ok || disposed) return;
        setUptime((await res.json()) as Uptime);
        setNow(Date.now());
      } catch {
        /* silent — the board keeps last-good */
      }
    };
    const iv = window.setInterval(() => {
      if (!document.hidden) pull();
    }, POLL_MS);
    return () => {
      disposed = true;
      ac?.abort();
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="status">
      <section className="sys-block" aria-label="Service uptime">
        <h2 className="sys-h">uptime</h2>
        {uptime.targets.length ? (
          <ul className="status-targets">
            {uptime.targets.map((t) => (
              <li className="status-row" key={t.name} data-status={t.status}>
                <span className="pulse status-dot" aria-hidden />
                <span className="status-name">{t.name}</span>
                <span className="status-state">{t.status}</span>
                <span className="status-strip" aria-hidden>
                  {t.strip.map((up, i) => (
                    <span key={i} className="strip-cell" data-up={up || undefined} />
                  ))}
                </span>
                <span className="status-pct">
                  {t.status === "collecting" ? "collecting…" : `${t.uptimePct.toFixed(1)}%`}
                </span>
                <span className="status-latency">{t.latencyMs != null ? `${t.latencyMs} ms` : "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sys-empty">uptime unavailable — core unreachable</p>
        )}
      </section>

      <section className="sys-block" aria-label="Incident history">
        <h2 className="sys-h">incidents</h2>
        {uptime.incidents.length ? (
          <ol className="incidents">
            {uptime.incidents.map((i, idx) => (
              <li key={`${i.target}-${i.start}-${idx}`} data-ongoing={i.end == null || undefined}>
                <span className="incident-target">{i.target}</span>
                <span className="incident-when">{now ? relTime(i.start, now) : ""}</span>
                <span className="incident-dur">{incidentDur(i, now)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="sys-empty">no incidents recorded — all systems nominal</p>
        )}
      </section>
    </div>
  );
}
