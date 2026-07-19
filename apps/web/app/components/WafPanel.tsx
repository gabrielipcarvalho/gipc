"use client";

import { useEffect, useRef, useState } from "react";
import type { WafSnapshot, WafProbeResult } from "../../data/lab";

/* App-layer WAF dashboard on /lab. Polls GET /api/lab/waf (aggregate, redacted — path only, never IP/UA)
   and previews the engine via GET /api/lab/waf/probe (a pure preview that does NOT touch the live counters).
   All server values (recent paths, probe sample/findings) render as auto-escaped JSX text — never HTML. */

const POLL_MS = 4000;

// Preset probe samples — each rides the query string, so each is a real request the engine really inspects.
// There is deliberately NO scanner-UA preset: a browser cannot set the User-Agent via fetch, so such a
// button could never actually match — it would be a dishonest, always-empty affordance.
const PROBES: { label: string; sample: string }[] = [
  { label: "path traversal", sample: "../../etc/passwd" },
  { label: "SQL injection", sample: "1' OR '1'='1" },
  { label: "XSS", sample: "<script>alert(1)</script>" },
  { label: "RCE probe", sample: "$(id)" },
];

export function WafPanel() {
  const [snap, setSnap] = useState<WafSnapshot | null>(null);
  const [probe, setProbe] = useState<WafProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    const poll = async () => {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch("/api/lab/waf", { cache: "no-store", signal: ctrl.signal });
        if (res.ok && !disposed.current) setSnap(await res.json());
      } catch {
        /* silent — keep the last snapshot */
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
    };
  }, []);

  async function runProbe(sample: string) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/lab/waf/probe?sample=${encodeURIComponent(sample)}`, { cache: "no-store" });
      if (disposed.current) return;
      if (res.status === 503) setMsg("WAF demo offline — the lab is disabled.");
      else if (res.status === 429) setMsg("slow down — too many probes in a moment.");
      else if (!res.ok) setMsg("the probe faltered — try again.");
      else {
        const data = (await res.json()) as WafProbeResult;
        if (disposed.current) return;
        setProbe(data);
        const n = data.findings.length;
        setMsg(n ? `flagged ${n} signature${n > 1 ? "s" : ""}` : "no signature matched");
      }
    } catch {
      if (!disposed.current) setMsg("core unreachable");
    } finally {
      if (!disposed.current) setBusy(false);
    }
  }

  const cats = snap ? Object.entries(snap.byCategory) : [];

  return (
    <section className="lab-panel" aria-labelledby="waf-h">
      <h2 id="waf-h" className="lab-h">
        App-layer WAF
      </h2>
      <p className="lab-lead">
        A signature monitor over the <strong>core API</strong>’s (<code>/api/*</code>) real request stream. It
        runs in <strong>monitor mode</strong> — it flags, it does not block. This is best-effort pattern
        matching (trivially bypassable by encoding or a request body), <em>not</em> a security boundary or
        whole-site protection. No fabricated attacks; fire a sample below to preview the engine’s verdict.
      </p>

      <dl className="load-stats" aria-label="WAF counters">
        <div>
          <dt>inspected</dt>
          <dd>{snap?.inspected ?? "—"}</dd>
        </div>
        <div>
          <dt>flagged</dt>
          <dd>{snap?.flagged ?? "—"}</dd>
        </div>
        <div>
          <dt>blocked</dt>
          <dd>{snap?.blocked ?? "—"}</dd>
        </div>
        <div>
          <dt>rate 429s</dt>
          <dd>{snap?.rateDenied ?? "—"}</dd>
        </div>
      </dl>

      {cats.length > 0 && (
        <ul className="waf-cats" aria-label="flags by category">
          {cats.map(([c, n]) => (
            <li key={c}>
              <code>{c}</code> · {n}
            </li>
          ))}
        </ul>
      )}

      <div className="pg-tabs" role="group" aria-label="sample probes">
        {PROBES.map((p) => (
          <button key={p.label} type="button" className="pg-tab" disabled={busy} onClick={() => runProbe(p.sample)}>
            {p.label}
          </button>
        ))}
      </div>

      {probe && (
        <div className="pg-result">
          <p className="pg-token">
            probe <code>{probe.sample}</code>
            {probe.findings.length ? "" : " → no signature matched"}
          </p>
          {probe.findings.length > 0 && (
            <ul className="waf-cats" aria-label="probe findings">
              {probe.findings.map((f, i) => (
                <li key={i}>
                  <code>{f.ruleId}</code> · {f.category}
                  {f.block ? (
                    <span className="waf-block">
                      {probe.monitorOnly ? " ⚠ would block if soft-block were enabled" : " ⚠ blocked"}
                    </span>
                  ) : (
                    ""
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="lab-note">{probe.note}</p>
        </div>
      )}

      {snap && snap.recent.length > 0 && (
        <>
          <p className="pg-token">recent flags (real core traffic):</p>
          <ul className="pg-events" aria-label="recent flags">
            {snap.recent.map((r, i) => (
              <li key={i}>
                <code>{r.category}</code> · {r.method} <span className="pg-ts">{r.path}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="lab-note">
        The dashboard counters reflect only real core traffic; the probe above is a preview and never touches
        them. On a quiet site “flagged” is usually low — that is honest.
      </p>
      <p className="lab-msg" aria-live="polite">
        {msg}
      </p>
    </section>
  );
}
