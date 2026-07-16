"use client";

import { useEffect, useRef, useState } from "react";
import type { DeepResponse, VolumeResponse } from "../../data/deep";
import { MultiSparkline } from "./Sparkline";

/* The observability deep-dive ("deep scry"): Grafana-class panels rendered natively — per-pod
   CPU/mem, latency ladder, error rate, node fs/net, Loki log volume. Every panel SHOWS the real
   query it runs (the query is the exhibit — visible even when data is absent). SSR-seeded via
   props; self-owned 60s poll after mount (slow-moving data; document.hidden guard; per-pull
   abort; disposed flag). Sparklines are decorative (aria-hidden) — the legend text carries the
   latest values for screen readers. */

const POLL_MS = 60_000;

function latest(points: { v: number }[]): number | null {
  return points.length ? points[points.length - 1].v : null;
}

function fmtV(v: number | null, unit: string): string {
  if (v == null) return "—";
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3);
  return `${s} ${unit}`;
}

export function DeepPanels({
  initialDeep,
  initialVolume,
}: {
  initialDeep: DeepResponse | null;
  initialVolume: VolumeResponse | null;
}) {
  const [deep, setDeep] = useState<DeepResponse | null>(initialDeep);
  const [volume, setVolume] = useState<VolumeResponse | null>(initialVolume);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    let deepAc: AbortController | null = null;
    let volAc: AbortController | null = null;
    const pull = async () => {
      deepAc?.abort();
      volAc?.abort();
      const d = new AbortController();
      const v = new AbortController();
      deepAc = d;
      volAc = v;
      try {
        const res = await fetch("/api/metrics/deep", { cache: "no-store", signal: d.signal });
        if (res.ok && !disposed.current) setDeep((await res.json()) as DeepResponse);
      } catch {
        /* keep last truth */
      }
      try {
        const res = await fetch("/api/logs/volume", { cache: "no-store", signal: v.signal });
        if (res.ok && !disposed.current) setVolume((await res.json()) as VolumeResponse);
      } catch {
        /* keep last truth */
      }
    };
    const t = window.setInterval(() => {
      if (!document.hidden) pull();
    }, POLL_MS);
    pull(); // the SSR seed is SLIM (query text only, no points) — fetch the full payload now
    return () => {
      disposed.current = true;
      deepAc?.abort();
      volAc?.abort();
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="sys-block deep" aria-label="Observability deep-dive">
      <h2 className="sys-h">deep scry — the queries are the exhibit</h2>
      {deep && deep.source !== "prometheus" && (
        <p className="sys-empty">deep metrics unavailable — re-scrying… (the queries below still show what WOULD run)</p>
      )}
      {deep && deep.panels.length ? (
        <div className="deep-grid">
          {deep.panels.map((p) => (
            <div className="deep-panel" key={p.key}>
              <h3 className="deep-title">
                {p.title} <span className="deep-unit">({p.unit})</span>
              </h3>
              {p.series.length ? (
                <>
                  <MultiSparkline series={p.series} />
                  <ul className="deep-legend">
                    {p.series.map((s) => (
                      <li key={s.label}>
                        <b>{s.label}</b> {fmtV(latest(s.points), p.unit)}
                      </li>
                    ))}
                  </ul>
                  {p.dropped ? <p className="deep-note">+{p.dropped} series not shown</p> : null}
                </>
              ) : (
                <p className="deep-note">no data</p>
              )}
              <code className="deep-q">{p.query}</code>
            </div>
          ))}
        </div>
      ) : !deep ? (
        <p className="sys-empty">deep metrics unavailable — re-scrying…</p>
      ) : null}

      <h3 className="deep-title deep-vol-head">
        log volume by app <span className="deep-unit">(lines / 5m)</span>
      </h3>
      {volume && volume.source === "loki" && volume.series.length ? (
        <>
          <div className="deep-vol">
            {volume.series.map((s) => (
              <div className="deep-vol-row" key={s.label}>
                <span className="deep-vol-label">{s.label}</span>
                <VolumeStrip points={s.points} />
                <span className="deep-vol-latest">{fmtV(latest(s.points), "")}</span>
              </div>
            ))}
          </div>
          <code className="deep-q">{volume.query}</code>
        </>
      ) : (
        <p className="sys-empty">log volume unavailable — re-scrying…</p>
      )}
    </section>
  );
}

/* Bar strip for log volume — bars land in FIXED TIME SLOTS (Loki omits empty buckets; index
   spacing would fabricate continuity and misalign rows). Slot = (t - windowStart) / step. */
function VolumeStrip({ points }: { points: { t: number; v: number }[] }) {
  if (!points.length) return <span className="spark-empty">no data</span>;
  const W = 140;
  const H = 18;
  const STEP = 300; // seconds — matches the server's disjoint 5m buckets
  const SLOTS = 7; // 30m window / 5m + 1
  const max = Math.max(...points.map((p) => p.v), 1);
  const end = Math.max(...points.map((p) => p.t));
  const start = end - (SLOTS - 1) * STEP;
  const bw = W / SLOTS;
  return (
    <svg className="deep-vol-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {points.map((p) => {
        const slot = Math.round((p.t - start) / STEP);
        if (slot < 0 || slot >= SLOTS) return null;
        const h = Math.max((p.v / max) * H, p.v > 0 ? 1 : 0);
        return <rect key={p.t} x={(slot * bw).toFixed(1)} y={(H - h).toFixed(1)} width={Math.max(bw - 1, 1).toFixed(1)} height={h.toFixed(1)} />;
      })}
    </svg>
  );
}
