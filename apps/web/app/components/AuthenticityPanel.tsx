"use client";

import { useEffect, useRef, useState } from "react";
import { AUTH_ASSETS } from "../../data/authenticity.generated";

/* /authenticity's client island — re-verifies the served assets against the build manifest in
   the visitor's own browser (WebCrypto SHA-256). Two-stage fetch per asset:
     1. plain no-store fetch — the visitor path. Match ⇒ pass. (no-store bypasses only the
        BROWSER cache; Cloudflare's edge may still serve a previous build for ~4h.)
     2. only on mismatch: re-fetch with ?v=<sha8>&r=<now> — the per-run r= guarantees origin
        bytes NOW (a stable buster alone would let CF cache a clean copy and mask later
        tampering as "stale"). Busted match ⇒ edge-stale (amber); busted mismatch ⇒ MISMATCH.
   Green is ONLY ever awarded on a stage-1 match — a stale edge can never show pass.
   Verdict precedence: MISMATCH > inconclusive/fetch-fail > edge-stale > pass. */

type AssetState = "idle" | "hashing" | "pass" | "stale" | "mismatch" | "fetchfail" | "recheckfail";
type Overall = null | "pass" | "mismatch" | "inconclusive" | "stale";

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STATE_TEXT: Record<AssetState, string> = {
  idle: "—",
  hashing: "hashing…",
  pass: "✓ match",
  stale: "edge cache out of sync — a cache-bypassing fetch matches this build",
  mismatch: "✗ MISMATCH",
  fetchfail: "fetch failed",
  recheckfail: "served bytes differ — origin re-check failed, inconclusive",
};

export function AuthenticityPanel() {
  const [states, setStates] = useState<Record<string, AssetState>>({});
  const [overall, setOverall] = useState<Overall>(null);
  const [running, setRunning] = useState(false);
  const [supported, setSupported] = useState(true);
  const [coreBuild, setCoreBuild] = useState<string | null>(null);
  const [sigStatus, setSigStatus] = useState<"checking" | "signed" | "unsigned">("checking");
  const disposed = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    disposed.current = false;
    if (!window.crypto?.subtle) setSupported(false);
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/version", { signal: ctrl.signal });
        if (r.ok) {
          const v = (await r.json()) as { version?: string };
          if (!disposed.current && v.version) setCoreBuild(v.version.slice(0, 7));
        }
      } catch {
        /* honest fallback below */
      }
    })();
    // résumé signature status — the ResumePanel pattern (presence of BOTH published artifacts)
    (async () => {
      try {
        const [sig, pub] = await Promise.all([
          fetch("/Gabriel_Carvalho_Resume.pdf.sig", { cache: "no-store", signal: ctrl.signal }),
          fetch("/resume-pubkey.spki", { cache: "no-store", signal: ctrl.signal }),
        ]);
        if (!disposed.current) setSigStatus(sig.ok && pub.ok ? "signed" : "unsigned");
      } catch {
        if (!disposed.current) setSigStatus("unsigned");
      }
    })();
    return () => {
      disposed.current = true;
      ctrl.abort();
      abortRef.current?.abort();
    };
  }, []);

  async function verify() {
    if (running || !supported) return;
    setRunning(true);
    setOverall(null);
    setStates(Object.fromEntries(AUTH_ASSETS.map((a) => [a.path, "hashing" as AssetState])));
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const results = await Promise.all(
      AUTH_ASSETS.map(async (a): Promise<AssetState> => {
        let plain: ArrayBuffer;
        try {
          const r = await fetch(a.path, { cache: "no-store", signal: ctrl.signal });
          if (!r.ok) return "fetchfail";
          plain = await r.arrayBuffer();
        } catch {
          return "fetchfail";
        }
        try {
          if (plain.byteLength === a.bytes && (await sha256Hex(plain)).toLowerCase() === a.sha256.toLowerCase()) {
            return "pass";
          }
        } catch {
          return "fetchfail"; // a digest failure is indistinguishable from unreadable bytes
        }
        // stage 2 — what does the origin serve NOW?
        try {
          const bust = `${a.path}?v=${a.sha256.slice(0, 8)}&r=${Date.now()}`;
          const r2 = await fetch(bust, { cache: "no-store", signal: ctrl.signal });
          if (!r2.ok) return "recheckfail";
          const origin = await r2.arrayBuffer();
          if (origin.byteLength === a.bytes && (await sha256Hex(origin)).toLowerCase() === a.sha256.toLowerCase()) {
            return "stale";
          }
          return "mismatch";
        } catch {
          return "recheckfail";
        }
      }),
    );

      if (disposed.current) return;
      const byPath: Record<string, AssetState> = {};
      AUTH_ASSETS.forEach((a, i) => (byPath[a.path] = results[i]));
      setStates(byPath);
      // precedence: MISMATCH > inconclusive/fetch-fail > edge-stale > pass
      let verdict: Overall = "pass";
      if (results.includes("mismatch")) verdict = "mismatch";
      else if (results.includes("fetchfail") || results.includes("recheckfail")) verdict = "inconclusive";
      else if (results.includes("stale")) verdict = "stale";
      setOverall(verdict);
    } finally {
      // a digest rejection must never leave the button stuck disabled (QA-CODE B-M1)
      if (!disposed.current) setRunning(false);
    }
  }

  const staleCount = Object.values(states).filter((s) => s === "stale").length;

  return (
    <div className="auth-panel">
      {!supported && (
        <p className="auth-note">your browser doesn&apos;t expose WebCrypto here — it can&apos;t verify locally.</p>
      )}
      <button type="button" className="btn btn-primary" onClick={verify} disabled={running || !supported}>
        {running ? "verifying…" : overall ? "verify again" : "▸ verify in your browser"}
      </button>

      {running && <p className="auth-note">hashing the served bytes…</p>}
      <div aria-live="polite">
        {overall === "pass" && (
          <p className="auth-verdict auth-ok">
            all {AUTH_ASSETS.length} assets match — the bytes your browser just fetched are this build&apos;s bytes.
          </p>
        )}
        {overall === "stale" && (
          <p className="auth-verdict auth-warn">
            origin verified — edge cache out of sync ({staleCount} asset{staleCount === 1 ? "" : "s"}).
            Typically a post-deploy cache refresh (clears within ~4h); persisting well past a deploy would
            be unexpected.
          </p>
        )}
        {overall === "mismatch" && (
          <p className="auth-verdict auth-bad">
            mismatch detected — served bytes do not match this build&apos;s manifest. See the table.
          </p>
        )}
        {overall === "inconclusive" && (
          <p className="auth-verdict auth-warn">
            inconclusive — some assets could not be fetched or re-checked. A fetch failure is never counted
            as a pass.
          </p>
        )}
      </div>

      {Object.keys(states).length > 0 && (
        <ul className="auth-results">
          {AUTH_ASSETS.map((a) => (
            <li key={a.path}>
              <code>{a.path}</code>{" "}
              <span
                className={
                  states[a.path] === "pass"
                    ? "auth-ok"
                    : states[a.path] === "mismatch"
                      ? "auth-bad"
                      : states[a.path] === "stale" || states[a.path] === "recheckfail"
                        ? "auth-warn"
                        : "auth-muted"
                }
              >
                {STATE_TEXT[states[a.path] ?? "idle"]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="auth-note">
        résumé signature:{" "}
        {sigStatus === "checking" && <span className="auth-muted">checking…</span>}
        {sigStatus === "signed" && (
          <span className="auth-ok">✓ published — verify a downloaded copy on <a href="/connect">/connect</a></span>
        )}
        {sigStatus === "unsigned" && <span className="auth-muted">not published (dev build)</span>}
      </p>
      <p className="auth-note">
        core API: {coreBuild ? <>build <code>{coreBuild}</code></> : "unavailable"} — a separate deploy unit
        from this web build; the web build&apos;s identity <em>is</em> the manifest above.
      </p>
    </div>
  );
}
