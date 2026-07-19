"use client";

import { useEffect, useRef, useState } from "react";
import {
  PLAYGROUND_ENDPOINTS,
  type ApiEndpoint,
  type DemoToken,
  type DemoEvent,
  type DemoEventsPage,
} from "../../data/lab";

const MAX_BODY = 4000;

type Result = {
  label: string;
  status: number;
  ms: number;
  contentType: string;
  retryAfter: string | null;
  body: string;
  truncated: boolean;
};

function formatBody(ct: string, raw: string): string {
  if (ct.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw; // JSON content-type but malformed body → show raw, never throw
    }
  }
  return raw;
}

// mask an opaque token so the panel shows it's real without splashing the whole string.
function maskToken(t: string): string {
  return t.length <= 14 ? t : `${t.slice(0, 6)}…${t.slice(-4)}`;
}

export function ApiPlaygroundPanel() {
  const [result, setResult] = useState<Result | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const disposed = useRef(false);

  // demo-token + pagination (P3)
  const [token, setToken] = useState<DemoToken | null>(null);
  const [tokenMsg, setTokenMsg] = useState("");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoMsg, setDemoMsg] = useState("");

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
    };
  }, []);

  async function run(ep: ApiEndpoint) {
    if (busy) return; // single-flight
    setBusy(true);
    setActive(ep.path);
    setMsg("");
    const t0 = performance.now();
    try {
      const res = await fetch(ep.path, { cache: "no-store" });
      const ms = Math.round(performance.now() - t0);
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      if (disposed.current) return;
      const full = formatBody(ct, raw);
      setResult({
        label: ep.label,
        status: res.status,
        ms,
        contentType: ct || "—",
        retryAfter: res.headers.get("retry-after"),
        body: full.slice(0, MAX_BODY),
        truncated: full.length > MAX_BODY,
      });
      setMsg(`${ep.label} → ${res.status} in ${ms} ms`);
    } catch {
      if (!disposed.current) {
        setResult(null);
        setActive(null); // clear the pressed state so no tab stays selected with no result
        setMsg("request failed — core unreachable");
      }
    } finally {
      if (!disposed.current) setBusy(false);
    }
  }

  async function mintToken() {
    if (demoBusy) return;
    setDemoBusy(true);
    setTokenMsg("");
    try {
      const res = await fetch("/api/lab/demo/token", { method: "POST" });
      if (disposed.current) return;
      if (res.status === 503) setTokenMsg("demo API offline — the lab is disabled.");
      else if (res.status === 429) setTokenMsg("slow down — too many requests in a moment.");
      else if (!res.ok) setTokenMsg("could not mint a demo token — try again.");
      else {
        const data = (await res.json()) as DemoToken;
        if (disposed.current) return;
        setToken(data);
        setTokenMsg(`minted a ${data.tokenType} token`);
      }
    } catch {
      if (!disposed.current) setTokenMsg("core unreachable");
    } finally {
      if (!disposed.current) setDemoBusy(false);
    }
  }

  // fetch a page of the demo events. append=false starts fresh; append=true extends via the cursor.
  // Sending no token deliberately surfaces the real 401 (the teaching moment).
  async function fetchEvents(cursor: string | null, append: boolean) {
    if (demoBusy) return;
    setDemoBusy(true);
    setDemoMsg("");
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token.token}`;
      let path = "/api/lab/demo/events?limit=10";
      if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
      const res = await fetch(path, { headers, cache: "no-store" });
      if (disposed.current) return;
      if (res.status === 401) setDemoMsg("401 — mint a demo token first (or it expired).");
      else if (res.status === 503) setDemoMsg("demo API offline — the lab is disabled.");
      else if (res.status === 429) setDemoMsg("slow down — too many requests in a moment.");
      else if (!res.ok) setDemoMsg("the demo request faltered — try again.");
      else {
        const data = (await res.json()) as DemoEventsPage;
        if (disposed.current) return;
        setEvents((prev) => (append ? [...prev, ...data.items] : data.items));
        setNextCursor(data.nextCursor); // null (or "") ⇒ Load-more hides
        setTotal(data.total);
        setDemoMsg(append ? `loaded ${data.items.length} more` : `showing ${data.items.length} of ${data.total}`);
      }
    } catch {
      if (!disposed.current) setDemoMsg("core unreachable");
    } finally {
      if (!disposed.current) setDemoBusy(false);
    }
  }

  return (
    <section className="lab-panel" aria-labelledby="pg-h">
      <h2 id="pg-h" className="lab-h">
        API playground
      </h2>
      <p className="lab-lead">
        Try the platform’s real read-only endpoints — a fixed allow-list of <code>GET</code> paths (no free-text
        URLs), returning the live response, status, timing and headers. These four return full snapshots; the
        demo-token surface below adds an honest auth-header flow and real cursor pagination.
      </p>

      <div className="pg-tabs" role="group" aria-label="endpoints">
        {PLAYGROUND_ENDPOINTS.map((ep) => (
          <button
            key={ep.path}
            type="button"
            className="pg-tab"
            aria-pressed={active === ep.path}
            disabled={busy}
            onClick={() => run(ep)}
            title={ep.note}
          >
            {ep.label}
          </button>
        ))}
      </div>

      {result && (
        <div className="pg-result">
          <dl className="pg-meta">
            <div>
              <dt>status</dt>
              <dd data-ok={result.status >= 200 && result.status < 300 ? "" : undefined}>
                {result.status >= 200 && result.status < 300 ? "✓" : "✗"} {result.status}
              </dd>
            </div>
            <div>
              <dt>time</dt>
              <dd>{result.ms} ms</dd>
            </div>
            <div>
              <dt>content-type</dt>
              <dd>{result.contentType}</dd>
            </div>
            {result.retryAfter && (
              <div>
                <dt>retry-after</dt>
                <dd>{result.retryAfter}s</dd>
              </div>
            )}
          </dl>
          <pre className="pg-body" tabIndex={0} aria-label={`${result.label} response body`}>
            {result.body}
            {result.truncated ? "\n… truncated" : ""}
          </pre>
        </div>
      )}
      {!result && <p className="lab-empty">pick an endpoint to try it</p>}

      <p className="lab-msg" aria-live="polite">
        {msg}
      </p>

      <div className="pg-demo">
        <h3 className="pg-subh">Demo token + pagination</h3>
        <p className="lab-lead">
          A demonstration of an auth-header flow and real cursor pagination over a <strong>synthetic</strong>{" "}
          demo dataset (clearly not real platform data). Mint an ephemeral demo token — it’s <em>not</em> real
          auth, just a short-lived key — then page through the events. Fetching without a token returns a real{" "}
          <code>401</code>.
        </p>
        <div className="pg-tabs" role="group" aria-label="demo token + pagination">
          <button type="button" className="pg-tab" disabled={demoBusy} onClick={mintToken}>
            mint demo token
          </button>
          <button type="button" className="pg-tab" disabled={demoBusy} onClick={() => fetchEvents(null, false)}>
            fetch demo events
          </button>
          {nextCursor && (
            <button type="button" className="pg-tab" disabled={demoBusy} onClick={() => fetchEvents(nextCursor, true)}>
              load more
            </button>
          )}
        </div>

        {token && (
          <p className="pg-token">
            token <code>{maskToken(token.token)}</code> · type {token.tokenType} · expires {token.expiresAt}
            {token.note ? ` · ${token.note}` : ""}
          </p>
        )}
        {/* always-rendered so the live region pre-exists to be announced (mirrors the msg region above) */}
        <p className="lab-msg" aria-live="polite">
          {tokenMsg}
        </p>

        {events.length > 0 && (
          <div className="pg-result">
            <ul className="pg-events">
              {events.map((e) => (
                <li key={e.id}>
                  <code>{e.ref}</code> · {e.kind} · <span className="pg-ts">{e.ts}</span>
                </li>
              ))}
            </ul>
            <p className="lab-msg">
              showing {events.length} of {total}
              {nextCursor ? " — more available" : " — end of list"}
            </p>
          </div>
        )}
        <p className="lab-msg" aria-live="polite">
          {demoMsg}
        </p>
      </div>
    </section>
  );
}
