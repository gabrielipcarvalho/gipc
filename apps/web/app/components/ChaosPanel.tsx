"use client";

import { useEffect, useRef, useState } from "react";
import type { ChaosStatus, ChaosKill } from "../../data/lab";

const POLL_MS = 2000;
const FAST_POLL_MS = 1000;
const COOLDOWN_MS = 10000;

async function killMessage(res: Response): Promise<string> {
  if (res.ok) {
    const k = (await res.json().catch(() => ({}))) as Partial<ChaosKill>;
    return k.killed ? `killed ${k.killed} — watch it heal` : "kill sent";
  }
  if (res.status === 429) return "cooling down — one kill every 10s"; // plain-text body, don't parse
  if (res.status === 409) return "no running pods to kill right now";
  if (res.status === 503) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    return b.error === "cluster unavailable" ? "the cluster's busy — try again" : "the lab is resting";
  }
  if (res.status === 502) return "the kill didn't take — try again";
  return "something went wrong — try again";
}

export function ChaosPanel() {
  const [status, setStatus] = useState<ChaosStatus | null>(null);
  const [msg, setMsg] = useState("");
  const [killing, setKilling] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [unreachable, setUnreachable] = useState(false); // honest state after repeated poll failures

  const disposed = useRef(false);
  const pollRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef(POLL_MS); // poll cadence — briefly dropped to FAST after a kill
  const failRef = useRef(0);

  // speed the poll for ~8s so the dip → recover is visible, then settle back
  function speedUp() {
    intervalRef.current = FAST_POLL_MS;
    window.setTimeout(() => {
      intervalRef.current = POLL_MS;
    }, 8000);
  }

  useEffect(() => {
    disposed.current = false;

    const poll = async () => {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch("/api/lab/chaos/status", { signal: ctrl.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        if (!disposed.current) {
          setStatus(await res.json());
          failRef.current = 0;
          setUnreachable(false);
        }
      } catch {
        // keep the last good state; only surface "unreachable" once we've never had data
        failRef.current += 1;
        if (!disposed.current && failRef.current >= 3) setUnreachable(true);
      } finally {
        window.clearTimeout(t);
      }
      if (!disposed.current) pollRef.current = window.setTimeout(poll, intervalRef.current);
    };
    poll();

    return () => {
      disposed.current = true;
      window.clearTimeout(pollRef.current);
    };
  }, []);

  async function kill() {
    if (killing || cooling) return;
    setKilling(true);
    try {
      const res = await fetch("/api/lab/chaos", { method: "POST" });
      if (disposed.current) return;
      setMsg(await killMessage(res));
      // 429 = already cooling; a successful kill starts the same 10s server cooldown, so lock the
      // button locally too (a 2nd click within 10s would only earn a 429).
      if (res.status === 429 || res.ok) {
        setCooling(true);
        window.setTimeout(() => !disposed.current && setCooling(false), COOLDOWN_MS);
      }
      if (res.ok) speedUp(); // speed the poll to catch the dip → recover
    } catch {
      if (!disposed.current) setMsg("network error — try again");
    } finally {
      if (!disposed.current) setKilling(false);
    }
  }

  const pods = status?.pods ?? [];
  const desired = status?.desired ?? (status ? pods.length : null);
  const ready = status?.ready;
  // never hide a live pod: show at least as many slots as pods currently exist
  const slots = Math.max(desired ?? 0, pods.length);

  return (
    <section className="lab-panel" aria-labelledby="chaos-h">
      <h2 id="chaos-h" className="lab-h">
        Chaos
      </h2>
      <p className="lab-lead">
        Delete a pod in the disposable <code>demo</code> namespace and watch Kubernetes recreate it.
      </p>

      <div className="chaos-status">
        {/* no aria-label — it would override and hide the visible "N/M ready" count from AT */}
        <span className="chaos-count">
          {ready ?? "—"}/{desired ?? "—"} ready
        </span>
        <div className="chaos-pods" aria-label="chaos target pods">
          {Array.from({ length: slots || 0 }).map((_, i) => {
            const pod = pods[i];
            const up = pod?.phase === "Running";
            return (
              <span key={pod?.name ?? i} className={`chaos-pod ${up ? "up" : "recovering"}`}>
                <span aria-hidden>{up ? "●" : "○"}</span> {up ? "up" : "recovering"}
              </span>
            );
          })}
          {slots === 0 && (
            <span className="chaos-pod recovering">
              {unreachable ? "chaos target unreachable" : "connecting…"}
            </span>
          )}
        </div>
      </div>

      <button type="button" className="chaos-kill" onClick={kill} disabled={killing || cooling}>
        {cooling ? "cooling down…" : killing ? "killing…" : "kill a pod ▸"}
      </button>
      <p className="lab-msg" aria-live="polite">
        {msg}
      </p>
    </section>
  );
}
