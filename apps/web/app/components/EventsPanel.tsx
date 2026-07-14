"use client";

import { useEffect, useRef, useState } from "react";
import type { LabEvent } from "../../data/lab";

const MAX_ROWS = 40;
const KNOWN_KINDS = new Set(["chaos", "loadtest"]);

type Row = LabEvent & { id: number };

function relTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

// Parse a `lab` SSE frame → LabEvent, rejecting malformed / wrong-shape frames.
function parseEvent(data: string): LabEvent | null {
  try {
    const e = JSON.parse(data) as LabEvent;
    return e && typeof e.kind === "string" && typeof e.ts === "string" ? e : null;
  } catch {
    return null;
  }
}

export function EventsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [now, setNow] = useState<number | null>(null);

  const keyRef = useRef(0);
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
        setStatusMsg("event link restored");
      }
    };

    const open = () => {
      if (disposed) return;
      es = new EventSource("/api/lab/events");
      es.addEventListener("lab", (e) => {
        if (disposed) return;
        setNow(Date.now()); // every frame advances relative times (heartbeats included)
        restored();
        const ev = parseEvent((e as MessageEvent).data);
        if (!ev || ev.kind === "heartbeat") return; // heartbeats keep the link fresh, never shown
        const id = keyRef.current++;
        setRows((prev) => [{ ...ev, id }, ...prev].slice(0, MAX_ROWS));
      });
      es.onopen = restored;
      es.onerror = () => {
        if (disposed) return;
        hadErrorRef.current = true;
        setStatusMsg("event link severed — reconnecting…");
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          const delay = backoffRef.current;
          backoffRef.current = Math.min(30000, delay * 2);
          reopenTimer = window.setTimeout(open, delay);
        }
      };
    };
    open();

    return () => {
      disposed = true;
      es?.close();
      if (reopenTimer) clearTimeout(reopenTimer);
    };
  }, []);

  return (
    <section className="lab-panel" aria-labelledby="evt-h">
      <h2 id="evt-h" className="lab-h">
        Event stream
      </h2>
      <p className="lab-lead">
        Live lab lifecycle events over SSE — every chaos kill and load test above appears here as it happens.
      </p>
      <p className="lab-msg" role="status" data-severed={statusMsg.includes("severed") || undefined}>
        {statusMsg}
      </p>
      {rows.length ? (
        <ol className="evt-log" aria-label="lab event log" tabIndex={0}>
          {rows.map((r) => (
            <li key={r.id} className="evt-row">
              <span className={`evt-kind ${KNOWN_KINDS.has(r.kind) ? r.kind : "other"}`}>{r.kind}</span>
              <span className="evt-detail">{r.detail || "—"}</span>
              <span className="evt-when">{now ? relTime(r.ts, now) : ""}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="lab-empty">no lab events yet — trigger a chaos kill or a load test above</p>
      )}
    </section>
  );
}
