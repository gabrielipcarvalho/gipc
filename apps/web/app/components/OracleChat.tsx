"use client";

import { useEffect, useRef, useState } from "react";
import { projects } from "../../data/projects";
import type { OracleCitation, OracleFrame } from "../../data/oracle";
import { TurnstileWidget } from "./TurnstileWidget";

/* The oracle chat. Streams POST /api/ai/oracle (SSE via fetch+getReader — EventSource can't POST).
   All facts about the operator come from the backend's cited retrieval; the trace panel is the
   "watch the agent think" exhibit. Honest degradation on every backend error; SSR-safe (browser reads
   in effects only); a11y: committed replies announce politely, the high-churn trace panel never does. */

const MSG_MAX = 2000;
const bySlug = new Map(projects.map((p) => [p.slug, p]));

type ChatMessage = { role: "user" | "assistant"; content: string; citations?: OracleCitation[] };

function mapError(status: number, code?: string): string {
  switch (code) {
    case "oracle not configured":
      return "the oracle isn't awakened yet — no key bound.";
    case "the oracle rests — daily budget spent":
    case "the oracle is temporarily unavailable":
      return `${code}.`;
    case "the oracle is busy":
      return "the oracle is busy — try again in a moment.";
  }
  if (status === 403 || code === "turnstile") return "verification failed — solve the check and retry.";
  if (status === 429 || code === "rate limited") return "too many questions — slow down a moment.";
  return "the oracle faltered.";
}

export function OracleChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [trace, setTrace] = useState<OracleFrame[]>([]);
  const [done, setDone] = useState<{ tokens_in: number; tokens_out: number; est_cost: number } | null>(null);
  const [phase, setPhase] = useState<"idle" | "streaming" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [botUnavailable, setBotUnavailable] = useState(false);
  const [context, setContext] = useState<string | null>(null);

  const disposed = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const resetTurnstile = useRef<(() => void) | null>(null);

  useEffect(() => {
    disposed.current = false;
    const slug = new URLSearchParams(window.location.search).get("ctx");
    const proj = slug ? bySlug.get(slug) : undefined;
    if (proj) setContext(`visitor is looking at the ${proj.name} project`);
    return () => {
      disposed.current = true;
      abortRef.current?.abort();
    };
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || phase === "streaming") return;
    if (!token) {
      setPhase("error");
      setErrorMsg("solve the bot check first.");
      return;
    }
    const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, MSG_MAX) }));
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setAnswer("");
    setTrace([]);
    setDone(null);
    setPhase("streaming");
    setErrorMsg("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    let cites: OracleCitation[] = [];
    let hadError = false;
    try {
      const res = await fetch("/api/ai/oracle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ message: msg.slice(0, MSG_MAX), history, context, turnstileToken: token }),
      });
      resetTurnstile.current?.(); // token is single-use — force a fresh solve next send
      setToken("");

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        if (!disposed.current) {
          setPhase("error");
          setErrorMsg(mapError(res.status, body?.error));
        }
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: rdone } = await reader.read();
        if (rdone) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? ""; // keep the trailing partial frame for the next chunk
        for (const p of parts) {
          if (!p.startsWith("data:")) continue;
          let f: OracleFrame;
          try {
            f = JSON.parse(p.slice(p.indexOf(":") + 1));
          } catch {
            continue; // a malformed frame must not kill the read loop
          }
          if (f.type === "token") {
            acc += f.text;
            if (!disposed.current) setAnswer(acc);
          } else if (f.type === "trace") {
            if (f.kind === "retrieval") cites = f.chunks;
            if (!disposed.current) setTrace((t) => [...t, f]);
          } else if (f.type === "done") {
            if (!disposed.current) setDone(f);
          } else if (f.type === "error") {
            hadError = true;
            if (!disposed.current) {
              setPhase("error");
              setErrorMsg(`${f.message}.`);
            }
          }
        }
      }
      if (disposed.current) return;
      if (acc.trim() && !hadError) {
        setMessages((m) => [...m, { role: "assistant", content: acc, citations: cites }]);
      }
      setAnswer("");
      if (!hadError) setPhase("idle");
    } catch (err) {
      if (disposed.current || (err as { name?: string })?.name === "AbortError") return;
      setPhase("error");
      setErrorMsg("the oracle faltered.");
    }
  }

  const canSend = phase !== "streaming" && input.trim().length > 0 && !!token;

  return (
    <div className="oracle">
      <div className="oracle-main">
        <ol className="oracle-log" aria-live="polite" aria-label="conversation">
          {messages.map((m, i) => (
            <li key={i} className={`oracle-msg ${m.role}`}>
              <span className="oracle-role" aria-hidden>
                {m.role === "user" ? "you ▸" : "oracle ▸"}
              </span>
              <div className="oracle-body">
                <p>{m.content}</p>
                {m.citations && m.citations.length > 0 && (
                  <p className="oracle-cites">
                    {m.citations.map((c, j) => (
                      <a key={j} href={c.url}>
                        [{j + 1}] {c.title}
                      </a>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {phase === "streaming" && answer && (
          <div className="oracle-msg assistant streaming" aria-busy="true">
            <span className="oracle-role" aria-hidden>
              oracle ▸
            </span>
            <div className="oracle-body">
              <p>{answer}</p>
            </div>
          </div>
        )}

        {phase === "error" && (
          <p className="oracle-error" role="alert">
            {errorMsg}
          </p>
        )}

        <form className="oracle-form" onSubmit={send}>
          <label htmlFor="oracle-input" className="oracle-label">
            ask the operator
          </label>
          <input
            id="oracle-input"
            className="oracle-input"
            value={input}
            maxLength={MSG_MAX}
            autoComplete="off"
            placeholder="what runs this site? what's the load right now?"
            onChange={(e) => setInput(e.target.value)}
            disabled={phase === "streaming"}
          />
          <div className="oracle-controls">
            <span className="oracle-count" aria-hidden>
              {input.length}/{MSG_MAX}
            </span>
            <button type="submit" className="oracle-send" disabled={!canSend}>
              {phase === "streaming" ? "…" : "send ▸"}
            </button>
          </div>
          {botUnavailable ? (
            <p className="oracle-note">bot check unavailable — the oracle needs it to answer.</p>
          ) : (
            <TurnstileWidget
              onToken={setToken}
              onError={() => setBotUnavailable(true)}
              resetRef={resetTurnstile}
            />
          )}
        </form>
      </div>

      <section className="oracle-trace" aria-label="agent trace" aria-live="off">
        <p className="oracle-trace-head">// trace — watch it think</p>
        {trace.length === 0 && phase !== "streaming" && (
          <p className="oracle-trace-idle">retrievals & tool calls appear here as the oracle works.</p>
        )}
        <ol className="oracle-trace-list">
          {trace.map((f, i) => {
            if (f.type !== "trace") return null;
            if (f.kind === "retrieval") {
              return (
                <li key={i} className="tr retrieval">
                  <b>retrieved</b> {f.chunks.length} chunks
                  {f.chunks.slice(0, 3).map((c, j) => (
                    <a key={j} href={c.url} className="tr-cite">
                      {c.title} · {c.score.toFixed(2)}
                    </a>
                  ))}
                </li>
              );
            }
            if (f.kind === "tool_call") {
              return (
                <li key={i} className="tr call">
                  <b>tool</b> {f.name}
                  {Object.keys(f.args).length > 0 && (
                    <code>{JSON.stringify(f.args)}</code>
                  )}
                </li>
              );
            }
            return (
              <li key={i} className="tr result">
                <b>↳</b> {f.name}: {f.summary}
              </li>
            );
          })}
        </ol>
        {done && (
          <p className="oracle-trace-cost" aria-hidden>
            ~${done.est_cost.toFixed(4)} · {done.tokens_in + done.tokens_out} tok
          </p>
        )}
      </section>
    </div>
  );
}
