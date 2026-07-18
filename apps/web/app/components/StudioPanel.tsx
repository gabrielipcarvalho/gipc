"use client";

import { useRef, useState } from "react";
import type { ThemePalette } from "../../data/oracle";
import { applyCustomPalette, applyTheme } from "../../data/themes";
import { mapOracleError } from "../../data/oracleErrors";
import { TURNSTILE_ON } from "../../data/turnstile";
import { TurnstileWidget } from "./TurnstileWidget";

/* AI Theme Studio: describe a mood → the LLM returns two hex seeds → the server derives a WCAG-clamped
   11-token palette → applied live as CSS custom properties (allowlist + value-guarded, no CSS injection).
   Persists across the site; "reset to arcane" clears it. SSR-safe; mirrors JdAnalyzer's async + Turnstile
   flow. Every applied value is a server-validated colour — the client never renders model text. */

const MOOD_MAX = 200;

export function StudioPanel() {
  const [mood, setMood] = useState("");
  const [phase, setPhase] = useState<"idle" | "pending" | "applied" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [botUnavailable, setBotUnavailable] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const resetTurnstile = useRef<(() => void) | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const m = mood.trim();
    if (!m || phase === "pending") return;
    if (TURNSTILE_ON && !token) {
      setPhase("error");
      setErrorMsg("solve the bot check first.");
      return;
    }
    setPhase("pending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/ai/theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mood: m.slice(0, MOOD_MAX), turnstileToken: token }),
      });
      resetTurnstile.current?.();
      setToken("");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPhase("error");
        setErrorMsg(mapOracleError(res.status, body?.error));
        return;
      }
      const palette = (await res.json()) as ThemePalette;
      applyCustomPalette(palette);
      setPhase("applied");
    } catch {
      setPhase("error");
      setErrorMsg("the oracle faltered.");
    }
  }

  function reset() {
    applyTheme("arcane"); // clears the custom palette AND returns to arcane — the label is honest
    setPhase("idle");
    setMood("");
  }

  const canSend = phase !== "pending" && mood.trim().length > 0 && (!TURNSTILE_ON || !!token);

  return (
    <div className="jd">
      <form className="jd-form" onSubmit={submit}>
        <label htmlFor="studio-input" className="oracle-label">
          describe a mood
        </label>
        <input
          id="studio-input"
          className="jd-input"
          value={mood}
          maxLength={MOOD_MAX}
          placeholder="e.g. autumnal dusk over a quiet sea — the palette regenerates live, kept WCAG-legible."
          onChange={(e) => setMood(e.target.value)}
          onFocus={() => setEngaged(true)}
          disabled={phase === "pending"}
        />
        <div className="oracle-controls">
          <span className="oracle-count" aria-hidden>
            {mood.length}/{MOOD_MAX}
          </span>
          <button type="button" className="jd-copy" onClick={reset}>
            reset to arcane
          </button>
          <button type="submit" className="oracle-send" disabled={!canSend}>
            {phase === "pending" ? "conjuring…" : "generate ▸"}
          </button>
        </div>
        {TURNSTILE_ON &&
          (botUnavailable ? (
            <p className="oracle-note">bot check unavailable — the studio needs it.</p>
          ) : engaged ? (
            <TurnstileWidget onToken={setToken} onError={() => setBotUnavailable(true)} resetRef={resetTurnstile} />
          ) : (
            <p className="oracle-note">a quick bot check appears when you start typing.</p>
          ))}
      </form>

      <div className="jd-status" aria-live="polite">
        {phase === "pending" && <p className="jd-pending">regenerating the palette from your mood…</p>}
        {phase === "applied" && (
          <p className="jd-pending">palette applied live — it persists across the site until you reset.</p>
        )}
      </div>
      {phase === "error" && (
        <p className="oracle-error" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
