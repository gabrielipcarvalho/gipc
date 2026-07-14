"use client";

import { useRef, useState } from "react";
import type { JdAnalysis, JdStrength } from "../../data/oracle";
import { mapOracleError } from "../../data/oracleErrors";
import { TURNSTILE_ON } from "../../data/turnstile";
import { TurnstileWidget } from "./TurnstileWidget";
import { MatrixText } from "./MatrixText";

/* Paste-a-JD: a JD in → an evidence-mapped analysis out (one-shot JSON, not streamed). Every strength is
   cited to a real résumé fact by the backend; gaps are honest. Non-color strength cues (symbol + word).
   Honest degradation on every backend error; SSR-safe. */

const JD_MAX = 8000;

const BADGE: Record<JdStrength, { sym: string; word: string }> = {
  strong: { sym: "●", word: "strong" },
  partial: { sym: "◐", word: "partial" },
  gap: { sym: "○", word: "gap" },
};

export function JdAnalyzer() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<JdAnalysis | null>(null);
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
      const res = await fetch("/api/ai/jd", {
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
      const data = (await res.json()) as JdAnalysis;
      setResult(data);
      setPhase("idle");
    } catch {
      setPhase("error");
      setErrorMsg("the oracle faltered.");
    }
  }

  async function copyPitch() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.pitch);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — the pitch is visible to select manually */
    }
  }

  const canSend =
    phase !== "pending" && text.trim().length > 0 && (!TURNSTILE_ON || !!token);

  return (
    <div className="jd">
      <form className="jd-form" onSubmit={submit}>
        <label htmlFor="jd-input" className="oracle-label">
          paste a job description
        </label>
        <textarea
          id="jd-input"
          className="jd-input"
          value={text}
          maxLength={JD_MAX}
          rows={8}
          placeholder="Paste the full JD. The oracle maps each requirement to real résumé evidence, writes a pitch, and lists gaps honestly."
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setEngaged(true)}
          disabled={phase === "pending"}
        />
        <div className="oracle-controls">
          <span className="oracle-count" aria-hidden>
            {text.length}/{JD_MAX}
          </span>
          <button type="submit" className="oracle-send" disabled={!canSend}>
            {phase === "pending" ? "analyzing…" : "analyze ▸"}
          </button>
        </div>
        {TURNSTILE_ON &&
          (botUnavailable ? (
            <p className="oracle-note">bot check unavailable — the analyzer needs it.</p>
          ) : engaged ? (
            <TurnstileWidget onToken={setToken} onError={() => setBotUnavailable(true)} resetRef={resetTurnstile} />
          ) : (
            <p className="oracle-note">a quick bot check appears when you start typing.</p>
          ))}
      </form>

      {/* polite region announces pending + completion; the error is a separate assertive alert so it
          can't double-announce inside a live region */}
      <div className="jd-status" aria-live="polite">
        {phase === "pending" && <p className="jd-pending">analyzing the JD against the résumé…</p>}
        {phase === "idle" && result && <p className="jd-pending">analysis ready.</p>}
      </div>
      {phase === "error" && (
        <p className="oracle-error" role="alert">
          {errorMsg}
        </p>
      )}

      {result && (
        <div className="jd-result">
          <h2 className="jd-h">Requirement mapping</h2>
          <div className="jd-table-wrap">
            <table className="jd-table">
              <caption className="jd-caption">Each requirement mapped to résumé evidence and a strength.</caption>
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Strength</th>
                </tr>
              </thead>
              <tbody>
                {result.requirements.map((r, i) => (
                  <tr key={i}>
                    <td>{r.requirement}</td>
                    <td>
                      {r.evidence.length > 0 ? (
                        <ul className="jd-ev">
                          {r.evidence.map((e, j) => (
                            <li key={j}>{e}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="jd-none">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`jd-badge ${r.strength}`}>
                        <span aria-hidden>{BADGE[r.strength].sym}</span> {BADGE[r.strength].word}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="jd-pitch">
            <div className="jd-pitch-head">
              <h2 className="jd-h">60-second pitch</h2>
              <button type="button" className="jd-copy" onClick={copyPitch}>
                {copied ? "copied ✓" : "copy"}
              </button>
            </div>
            <p className="oracle-answer">
              <MatrixText text={result.pitch} />
            </p>
          </div>

          {result.gaps.length > 0 && (
            <div className="jd-gaps">
              <h2 className="jd-h">Honest gaps</h2>
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
