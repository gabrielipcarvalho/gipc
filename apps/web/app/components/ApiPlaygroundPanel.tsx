"use client";

import { useEffect, useRef, useState } from "react";
import { PLAYGROUND_ENDPOINTS, type ApiEndpoint } from "../../data/lab";

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

export function ApiPlaygroundPanel() {
  const [result, setResult] = useState<Result | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const disposed = useRef(false);

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

  return (
    <section className="lab-panel" aria-labelledby="pg-h">
      <h2 id="pg-h" className="lab-h">
        API playground
      </h2>
      <p className="lab-lead">
        Try the platform’s real read-only endpoints — a fixed allow-list of <code>GET</code> paths (no free-text
        URLs), returning the live response, status, timing and headers. None of these paginate.
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
    </section>
  );
}
