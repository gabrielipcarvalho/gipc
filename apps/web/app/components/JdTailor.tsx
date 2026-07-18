"use client";

import { useRef, useState } from "react";
import type { TailoredResume } from "../../data/oracle";
import { mapOracleError } from "../../data/oracleErrors";
import { TURNSTILE_ON } from "../../data/turnstile";
import { TurnstileWidget } from "./TurnstileWidget";

/* Tailor a résumé to a JD: a JD in → the SAME résumé facts reordered most-relevant-first (deterministic,
   no LLM). Every line is a verbatim résumé fact — nothing is generated, so nothing can be fabricated.
   `matched` chips show which JD terms each fact hit; `gaps` are recognized skills the JD wants that the
   résumé does not evidence. Copy-only (parity with the analyzer; the prod CSP forbids blob: downloads).
   SSR-safe; every JD-derived string is plain auto-escaped React text. */

const JD_MAX = 8000;

const KIND: Record<TailoredResume["ordered"][number]["kind"], string> = {
  bullet: "experience",
  project: "project",
  skill: "skills",
};

function tailoredText(r: TailoredResume): string {
  const lines = r.ordered.map((f) => {
    const m = f.matched.length ? `  [matches: ${f.matched.join(", ")}]` : "";
    return `• ${f.section} — ${f.text}${m}`;
  });
  const gaps = r.gaps.length ? `\n\nGaps the JD asks for (not evidenced): ${r.gaps.join(", ")}` : "";
  return `Résumé tailored to this JD — real facts reordered, nothing invented:\n\n${lines.join("\n")}${gaps}`;
}

export function JdTailor() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TailoredResume | null>(null);
  const [phase, setPhase] = useState<"idle" | "pending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [botUnavailable, setBotUnavailable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const resetTurnstile = useRef<(() => void) | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const jd = text.trim();
    if (!jd || phase === "pending") return;
    if (TURNSTILE_ON && !token) {
      setPhase("error");
      setErrorMsg("solve the bot check first.");
      return;
    }
    setPhase("pending");
    setErrorMsg("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/variant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jdText: jd.slice(0, JD_MAX), turnstileToken: token }),
      });
      resetTurnstile.current?.();
      setToken("");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPhase("error");
        setErrorMsg(mapOracleError(res.status, body?.error));
        return;
      }
      const data = (await res.json()) as TailoredResume;
      setResult(data);
      setPhase("idle");
    } catch {
      setPhase("error");
      setErrorMsg("the oracle faltered.");
    }
  }

  async function copyAll() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(tailoredText(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — the tailored résumé is visible to select manually */
    }
  }

  const canSend = phase !== "pending" && text.trim().length > 0 && (!TURNSTILE_ON || !!token);

  return (
    <div className="jd">
      <form className="jd-form" onSubmit={submit}>
        <label htmlFor="tailor-input" className="oracle-label">
          paste a job description
        </label>
        <textarea
          id="tailor-input"
          className="jd-input"
          value={text}
          maxLength={JD_MAX}
          rows={8}
          placeholder="Paste the full JD. The same résumé facts are reordered to surface what this role wants first — deterministically, with nothing invented."
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setEngaged(true)}
          disabled={phase === "pending"}
        />
        <div className="oracle-controls">
          <span className="oracle-count" aria-hidden>
            {text.length}/{JD_MAX}
          </span>
          <button type="submit" className="oracle-send" disabled={!canSend}>
            {phase === "pending" ? "tailoring…" : "tailor ▸"}
          </button>
        </div>
        {TURNSTILE_ON &&
          (botUnavailable ? (
            <p className="oracle-note">bot check unavailable — the tailor needs it.</p>
          ) : engaged ? (
            <TurnstileWidget onToken={setToken} onError={() => setBotUnavailable(true)} resetRef={resetTurnstile} />
          ) : (
            <p className="oracle-note">a quick bot check appears when you start typing.</p>
          ))}
      </form>

      <div className="jd-status" aria-live="polite">
        {phase === "pending" && <p className="jd-pending">reordering the résumé to the JD…</p>}
        {phase === "idle" && result && <p className="jd-pending">tailored résumé ready.</p>}
      </div>
      {phase === "error" && (
        <p className="oracle-error" role="alert">
          {errorMsg}
        </p>
      )}

      {result && (
        <div className="jd-result">
          <div className="jd-pitch-head">
            <h2 className="jd-h">Résumé, reordered to this JD</h2>
            <button type="button" className="jd-copy" onClick={copyAll}>
              {copied ? "copied ✓" : "copy"}
            </button>
          </div>
          <div className="jd-table-wrap">
            <table className="jd-table">
              <caption className="jd-caption">
                Every line is a real résumé fact, reordered most-relevant first — nothing is invented.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Résumé fact</th>
                  <th scope="col">Matched</th>
                </tr>
              </thead>
              <tbody>
                {result.ordered.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="jd-none">
                        {f.section} · {KIND[f.kind]}
                      </span>
                      <div>{f.text}</div>
                    </td>
                    <td>
                      {f.matched.length > 0 ? (
                        <ul className="jd-ev">
                          {f.matched.map((m, j) => (
                            <li key={j}>{m}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="jd-none">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.gaps.length > 0 && (
            <div className="jd-gaps">
              <h2 className="jd-h">Gaps the JD asks for</h2>
              <ul>
                {result.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
