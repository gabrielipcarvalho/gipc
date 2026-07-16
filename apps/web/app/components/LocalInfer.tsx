"use client";

import { useEffect, useRef, useState } from "react";
import { TURNSTILE_ON } from "../../data/turnstile";
import { mapOracleError } from "../../data/oracleErrors";
import { TurnstileWidget } from "./TurnstileWidget";

/* The self-hosted live-inference demo: streams REAL tokens from the in-cluster Ollama via
   /api/ai/infer and shows real stats (TTFT, tok/s, totals) + an honest cost line. The exhibit is
   the pipeline (self-hosted streaming + measured numbers), not the prose — it's a 0.5B CPU model
   and the UI says so. Honest degradation on every failure (offline/busy/rate-limited); SSR-safe;
   stream region aria-live=off (high churn), stats role=status (one polite announce on end). */

const PROMPT_MAX = 500;

type Stats = {
  ttft_ms: number;
  tokens: number;
  prompt_tokens: number;
  duration_ms: number;
  tok_per_s: number;
  api_equiv_usd: number;
};

export function LocalInfer() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [phase, setPhase] = useState<"idle" | "streaming" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [botUnavailable, setBotUnavailable] = useState(false);
  const [engaged, setEngaged] = useState(false);

  const disposed = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const resetTurnstile = useRef<(() => void) | null>(null);

  // unmount (tab switch mid-stream): abort the fetch so the hidden reader stops consuming the
  // stream and the server's single infer slot is freed — OracleChat's exact lifecycle pattern
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const canSend = prompt.trim().length > 0 && phase !== "streaming" && (!TURNSTILE_ON || !!token);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const p = prompt.trim();
    if (!p || phase === "streaming") return;
    if (TURNSTILE_ON && !token) {
      setPhase("error");
      setErrorMsg("solve the bot check first.");
      return;
    }
    setOutput("");
    setStats(null);
    setPhase("streaming");
    setErrorMsg("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/ai/infer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ prompt: p.slice(0, PROMPT_MAX), turnstileToken: token }),
      });
      resetTurnstile.current?.(); // single-use token
      setToken("");

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        if (!disposed.current) {
          setPhase("error");
          setErrorMsg(mapOracleError(res.status, body?.error));
        }
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          let f: { type: string; [k: string]: unknown };
          try {
            f = JSON.parse(part.slice(part.indexOf(":") + 1));
          } catch {
            continue; // malformed frame must not kill the loop
          }
          if (disposed.current) return;
          if (f.type === "meta") setModel(String(f.model ?? ""));
          else if (f.type === "token") setOutput((o) => o + String(f.text ?? ""));
          else if (f.type === "stats") setStats(f as unknown as Stats);
          else if (f.type === "error") {
            setPhase("error");
            setErrorMsg(String(f.message ?? "the local stream faltered."));
            return;
          }
        }
      }
      if (!disposed.current) setPhase("idle");
    } catch (err) {
      // an unmount abort is not an error — only paint real mid-stream failures
      if (!disposed.current && !(err instanceof DOMException && err.name === "AbortError")) {
        setPhase("error");
        setErrorMsg("connection lost mid-stream.");
      }
    }
  }

  return (
    <div className="infer">
      <p className="infer-lead">
        real inference on my own hardware: an in-cluster Ollama on the k3s box, streamed through the
        same protected pipeline as the oracle. it&apos;s a 0.5B CPU model — the demo is the
        engineering, not the prose.
      </p>

      <form className="oracle-form" onSubmit={run}>
        <label htmlFor="infer-input" className="oracle-label">
          prompt the local model
        </label>
        <input
          id="infer-input"
          className="oracle-input"
          value={prompt}
          maxLength={PROMPT_MAX}
          autoComplete="off"
          placeholder="ask something small — it runs on my CPU"
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setEngaged(true)}
          disabled={phase === "streaming"}
        />
        <div className="oracle-controls">
          <span className="oracle-count" aria-hidden>
            {prompt.length}/{PROMPT_MAX}
          </span>
          <button type="submit" className="oracle-send" disabled={!canSend}>
            {phase === "streaming" ? "…" : "run ▸"}
          </button>
        </div>
        {TURNSTILE_ON &&
          (botUnavailable ? (
            <p className="oracle-note">bot check unavailable — the demo needs it to run.</p>
          ) : engaged ? (
            <TurnstileWidget
              onToken={setToken}
              onError={() => setBotUnavailable(true)}
              resetRef={resetTurnstile}
            />
          ) : (
            <p className="oracle-note">a quick bot check appears when you start typing.</p>
          ))}
      </form>

      {phase === "error" && (
        <p className="oracle-error" role="alert">
          {errorMsg}
        </p>
      )}

      {(output || phase === "streaming") && (
        <div className="infer-out" aria-live="off">
          {model && <p className="infer-model">// {model}</p>}
          <p className="infer-text">{output || "…"}</p>
        </div>
      )}

      <div role="status">
        {stats && (
          <dl className="infer-stats">
            <div>
              <dt>ttft</dt>
              <dd>{stats.ttft_ms} ms</dd>
            </div>
            <div>
              <dt>speed</dt>
              <dd>{stats.tok_per_s} tok/s</dd>
            </div>
            <div>
              <dt>tokens</dt>
              <dd>
                {stats.tokens} out · {stats.prompt_tokens} in
              </dd>
            </div>
            <div>
              <dt>elapsed</dt>
              <dd>{stats.duration_ms} ms</dd>
            </div>
            <div className="infer-cost">
              <dt>cost</dt>
              <dd>
                self-hosted: ~$0 marginal · same tokens at the oracle&apos;s API rates: $
                {stats.api_equiv_usd.toFixed(6)}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
