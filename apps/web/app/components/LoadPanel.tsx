"use client";

import { useEffect, useRef, useState } from "react";
import type { LoadHistogram } from "../../data/lab";

const MAX_C = 50;
const MAX_S = 10;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// Parse an SSE frame → LoadHistogram, rejecting valid-JSON-but-wrong-shape frames so a missing
// field (bad buckets, or a scalar that render later `.toFixed()`s) can't crash the render.
// Returns null on any parse/shape failure.
const NUM_FIELDS: (keyof LoadHistogram)[] = ["total", "errors", "p50", "p95", "p99", "rps", "elapsedMs"];
function parseHistogram(data: string): LoadHistogram | null {
  try {
    const h = JSON.parse(data) as LoadHistogram;
    if (!h || !Array.isArray(h.buckets)) return null;
    if (!NUM_FIELDS.every((k) => Number.isFinite(h[k] as number))) return null;
    if (!h.buckets.every((b) => Number.isFinite(b?.ms) && Number.isFinite(b?.count))) return null;
    return h;
  } catch {
    return null;
  }
}

export function LoadPanel() {
  const [c, setC] = useState(20);
  const [s, setS] = useState(5);
  const [running, setRunning] = useState(false);
  const [hist, setHist] = useState<LoadHistogram | null>(null);
  const [msg, setMsg] = useState("");
  const [doneMsg, setDoneMsg] = useState(""); // announced once on completion

  const esRef = useRef<EventSource | null>(null);
  const finished = useRef(false);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      esRef.current?.close();
    };
  }, []);

  function stop() {
    esRef.current?.close(); // disconnect cancels the server run
    esRef.current = null;
    if (!disposed.current) {
      setRunning(false);
      if (!finished.current) setDoneMsg("run stopped"); // announce the cancel (empty live region otherwise)
    }
  }

  function start() {
    if (running) return; // single-flight (server 409s a 2nd anyway)
    const cc = clamp(c, 1, MAX_C);
    const ss = clamp(s, 1, MAX_S);
    setC(cc);
    setS(ss);
    setHist(null);
    setMsg("");
    setDoneMsg("");
    finished.current = false;
    setRunning(true);

    const es = new EventSource(`/api/lab/loadtest?c=${cc}&s=${ss}`);
    esRef.current = es;

    es.addEventListener("histogram", (e) => {
      if (disposed.current) return;
      const h = parseHistogram((e as MessageEvent).data);
      if (h) setHist(h);
    });
    es.addEventListener("done", (e) => {
      if (disposed.current) return;
      finished.current = true;
      const h = parseHistogram((e as MessageEvent).data);
      if (h) {
        setHist(h);
        setDoneMsg(
          `done — ${h.total} requests, ${h.errors} errors, p50 ${h.p50} ms, p95 ${h.p95} ms, p99 ${h.p99} ms`,
        );
      }
      es.close();
      esRef.current = null;
      setRunning(false);
    });
    es.onerror = () => {
      if (finished.current || disposed.current) return; // late EOF after done — ignore
      setMsg("the load test couldn't run — try again"); // EventSource can't read status/body
      es.close();
      esRef.current = null;
      setRunning(false);
    };
  }

  const maxCount = hist ? Math.max(1, ...hist.buckets.map((b) => b.count)) : 1;

  return (
    <section className="lab-panel" aria-labelledby="load-h">
      <h2 id="load-h" className="lab-h">
        Load test
      </h2>
      <p className="lab-lead">
        Fire a bounded burst at an <strong>isolated demo target</strong> (never this site) and watch the
        latency histogram build live. Hard caps: ≤{MAX_C} concurrent · ≤{MAX_S}s · server-clamped.
      </p>

      <div className="load-controls">
        <label className="load-field">
          <span>concurrency</span>
          <input
            type="number"
            min={1}
            max={MAX_C}
            value={c}
            disabled={running}
            onChange={(e) => setC(clamp(Number(e.target.value), 1, MAX_C))}
          />
        </label>
        <label className="load-field">
          <span>seconds</span>
          <input
            type="number"
            min={1}
            max={MAX_S}
            value={s}
            disabled={running}
            onChange={(e) => setS(clamp(Number(e.target.value), 1, MAX_S))}
          />
        </label>
        {running ? (
          <button type="button" className="load-stop" onClick={stop}>
            stop ▪
          </button>
        ) : (
          <button type="button" className="load-start" onClick={start}>
            run load ▸
          </button>
        )}
      </div>

      {hist && (
        <>
          <div className="load-hist" aria-hidden>
            {hist.buckets.map((b) => (
              <span
                key={b.ms}
                className="load-bar"
                style={{ height: `${Math.round((b.count / maxCount) * 100)}%` }}
                title={`${b.ms} ms — ${b.count}`}
              />
            ))}
          </div>
          <dl className="load-stats">
            <div>
              <dt>reqs</dt>
              <dd>{hist.total}</dd>
            </div>
            <div>
              <dt>rps</dt>
              <dd>{hist.rps.toFixed(0)}</dd>
            </div>
            <div>
              <dt>errors</dt>
              <dd>{hist.errors}</dd>
            </div>
            <div>
              <dt>p50</dt>
              <dd>{hist.p50} ms</dd>
            </div>
            <div>
              <dt>p95</dt>
              <dd>{hist.p95} ms</dd>
            </div>
            <div>
              <dt>p99</dt>
              <dd>{hist.p99} ms</dd>
            </div>
          </dl>
        </>
      )}

      <p className="lab-msg" aria-live="polite">
        {doneMsg || msg}
      </p>
    </section>
  );
}
