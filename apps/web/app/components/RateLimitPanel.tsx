"use client";

import { useEffect, useRef, useState } from "react";
import type { RateLimitSnapshot } from "../../data/lab";

const POLL_MS = 2000;
const HAMMER_N = 40; // > burst (default 20) so the limiter visibly refuses the overflow

export function RateLimitPanel() {
  const [snap, setSnap] = useState<RateLimitSnapshot | null>(null);
  const [cells, setCells] = useState<number[]>([]); // per-request status codes from the last hammer
  const [hammering, setHammering] = useState(false);
  const [msg, setMsg] = useState("");
  const disposed = useRef(false);
  const repollRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    disposed.current = false;
    const poll = async () => {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch("/api/lab/ratelimit", { cache: "no-store", signal: ctrl.signal });
        if (res.ok && !disposed.current) setSnap(await res.json());
      } catch {
        /* silent — keep last snapshot */
      } finally {
        window.clearTimeout(t);
      }
    };
    poll();
    const iv = window.setInterval(() => {
      if (!document.hidden) poll();
    }, POLL_MS);
    return () => {
      disposed.current = true;
      window.clearInterval(iv);
      window.clearTimeout(repollRef.current);
    };
  }, []);

  async function hammer() {
    if (hammering) return; // single-flight
    setHammering(true);
    setCells([]);
    setMsg("");
    try {
      const results = await Promise.all(
        Array.from({ length: HAMMER_N }, () =>
          fetch("/api/version", { cache: "no-store" })
            .then((r) => r.status)
            .catch(() => 0),
        ),
      );
      if (disposed.current) return;
      setCells(results);
      const ok = results.filter((s) => s >= 200 && s < 300).length;
      const limited = results.filter((s) => s === 429).length;
      const failed = results.length - ok - limited; // network errors (status 0) or other non-2xx
      setMsg(
        `hammer done — ${ok} ok, ${limited} rate-limited (429)` + (failed ? `, ${failed} failed` : ""),
      );
      // let the per-IP bucket refill, then re-poll so the climbed `denied` is visible
      window.clearTimeout(repollRef.current); // drop any pending re-poll from a prior hammer
      repollRef.current = window.setTimeout(async () => {
        try {
          const res = await fetch("/api/lab/ratelimit", { cache: "no-store" });
          if (res.ok && !disposed.current) setSnap(await res.json());
        } catch {
          /* silent */
        }
      }, 1800);
    } finally {
      if (!disposed.current) setHammering(false);
    }
  }

  return (
    <section className="lab-panel" aria-labelledby="rl-h">
      <h2 id="rl-h" className="lab-h">
        Rate limiter
      </h2>
      <p className="lab-lead">
        The real per-IP token bucket that guards every <code>/api/*</code> route. Hammer it and watch it
        refuse past the burst — these are live responses, not a simulation.
      </p>

      <dl className="load-stats" aria-label="rate limiter state">
        <div>
          <dt>rps</dt>
          <dd>{snap?.rps ?? "—"}</dd>
        </div>
        <div>
          <dt>burst</dt>
          <dd>{snap?.burst ?? "—"}</dd>
        </div>
        <div>
          <dt>active IPs</dt>
          <dd>{snap?.activeBuckets ?? "—"}</dd>
        </div>
        <div>
          <dt>429s total</dt>
          <dd>{snap?.denied ?? "—"}</dd>
        </div>
      </dl>

      <button type="button" className="load-start" onClick={hammer} disabled={hammering}>
        {hammering ? "hammering…" : `hammer it (${HAMMER_N} requests) ▸`}
      </button>

      {cells.length > 0 && (
        <div className="rl-cells" aria-hidden>
          {cells.map((s, i) => {
            const cls = s >= 200 && s < 300 ? "ok" : s === 429 ? "limited" : "failed";
            return (
              <span key={i} className={`rl-cell ${cls}`}>
                {cls === "ok" ? "·" : cls === "limited" ? "×" : "!"}
              </span>
            );
          })}
        </div>
      )}

      <p className="lab-note">
        fires {HAMMER_N} requests at once at the limiter (burst ~{snap?.burst ?? 20}); your other panels share
        this per-IP limit, so they may briefly rate-limit too. “429s total” is a global cumulative counter.
      </p>
      <p className="lab-msg" aria-live="polite">
        {msg}
      </p>
    </section>
  );
}
