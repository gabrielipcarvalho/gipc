"use client";

import { useEffect, useRef, useState } from "react";
import { projects } from "../../data/projects";
import { bySlug as writeupBySlug } from "../../data/writeups";
import type { OracleCitation, OracleFrame } from "../../data/oracle";
import { mapOracleError } from "../../data/oracleErrors";
import { firstStation } from "../../data/construct";
import { TURNSTILE_ON } from "../../data/turnstile";
import { TurnstileWidget } from "./TurnstileWidget";
import { MatrixText } from "./MatrixText";

/* The oracle chat. Streams POST /api/ai/oracle (SSE via fetch+getReader — EventSource can't POST).
   All facts about the operator come from the backend's cited retrieval; the trace panel is the
   "watch the agent think" exhibit. Honest degradation on every backend error; SSR-safe (browser reads
   in effects only); a11y: committed replies announce politely, the high-churn trace panel never does. */

const MSG_MAX = 2000;
const bySlug = new Map(projects.map((p) => [p.slug, p]));

/* Visitor-context (?ctx=/?about=) — typed-slug grammar, mirrored server-side in app/context.py.
   The chip label is client cosmetics; the PHRASE the model sees is resolved by the SERVER from its
   own data (the raw param never enters the prompt). Client/server list drift across the manual ai
   deploy window degrades to "context silently dropped" — the chip copy stays neutral about it. */
const CTX_STATIONS = new Map<string, string>([
  ["profile", "résumé · profile"], ["skills", "résumé · skills"],
  ["experience", "résumé · experience"], ["projects", "résumé · projects"],
  ["publications", "résumé · publications"], ["education", "résumé · education"],
  ["honours", "résumé · honours"],
]);
const CTX_PAGES = new Map<string, string>([
  ["work", "the work deck"], ["writeups", "the writeups"], ["resume", "the résumé"],
  ["timeline", "the timeline"], ["system", "the system dashboard"], ["lab", "the Lab"],
  ["infra", "the infra overview"], ["status", "the status page"], ["connect", "connect"],
  ["meet", "book-a-call"],
]);

/* Dual-form parser: typed "type:key" (validated per namespace) OR legacy bare token (live WorkGrid
   links + old bookmarks) tried as project → station → page → writeup. Returns the TYPED wire value
   + a human label, or null. */
function parseCtx(raw: string | null): { wire: string; label: string } | null {
  if (!raw) return null;
  const val = raw.trim();
  if (val.includes(":")) {
    const [kind, key] = [val.slice(0, val.indexOf(":")), val.slice(val.indexOf(":") + 1)];
    if (kind === "project") {
      const proj = bySlug.get(key);
      return proj ? { wire: val, label: proj.name } : null;
    }
    if (kind === "station") {
      const t = CTX_STATIONS.get(key);
      return t ? { wire: val, label: t } : null;
    }
    if (kind === "page") {
      const t = CTX_PAGES.get(key);
      return t ? { wire: val, label: t } : null;
    }
    if (kind === "writeup") {
      const w = writeupBySlug(key);
      return w ? { wire: val, label: w.title } : null;
    }
    return null;
  }
  const proj = bySlug.get(val);
  if (proj) return { wire: `project:${val}`, label: proj.name };
  if (CTX_STATIONS.has(val)) return { wire: `station:${val}`, label: CTX_STATIONS.get(val)! };
  if (CTX_PAGES.has(val)) return { wire: `page:${val}`, label: CTX_PAGES.get(val)! };
  const w = writeupBySlug(val);
  if (w) return { wire: `writeup:${val}`, label: w.title };
  return null;
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: OracleCitation[];
  uiStation?: string; // agent-offered Construct descent (validated against CTX_STATIONS)
};

export function OracleChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [trace, setTrace] = useState<OracleFrame[]>([]);
  const [phase, setPhase] = useState<"idle" | "streaming" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState("");
  const [botUnavailable, setBotUnavailable] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [ctxLabel, setCtxLabel] = useState<string | null>(null);
  const [engaged, setEngaged] = useState(false); // lazy-mount Turnstile only once the visitor engages

  const disposed = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const resetTurnstile = useRef<(() => void) | null>(null);

  useEffect(() => {
    disposed.current = false;
    const params = new URLSearchParams(window.location.search);
    const parsed = parseCtx(params.get("ctx") || params.get("about")); // || — an empty ctx= falls through to the alias
    if (parsed) {
      setContext(parsed.wire); // the TYPED slug — the server resolves the phrase from its own data
      setCtxLabel(parsed.label);
    }
    return () => {
      disposed.current = true;
      abortRef.current?.abort();
    };
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || phase === "streaming") return;
    if (TURNSTILE_ON && !token) {
      setPhase("error");
      setErrorMsg("solve the bot check first.");
      return;
    }
    const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, MSG_MAX) }));
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setTrace([]);
    setPhase("streaming");
    setErrorMsg("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    let cites: OracleCitation[] = [];
    let uiStation: string | null = null; // first-wins — the "at most once" tool contract
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
          setErrorMsg(mapOracleError(res.status, body?.error));
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
            acc += f.text; // buffered — the full answer is decode-revealed on commit, not streamed raw
          } else if (f.type === "trace") {
            if (f.kind === "retrieval") cites = f.chunks;
            if (!disposed.current) setTrace((t) => [...t, f]);
          } else if (f.type === "ui") {
            // client re-validation (defense in depth) — junk/unknown station ids are dropped
            if (f.action === "station" && CTX_STATIONS.has(f.id) && !uiStation) uiStation = f.id;
          } else if (f.type === "done") {
            // tokens/cost are recorded server-side (audit) — never surfaced in the UI
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
        setMessages((m) => [
          ...m,
          { role: "assistant", content: acc, citations: cites, ...(uiStation ? { uiStation } : {}) },
        ]);
      }
      if (!hadError) setPhase("idle");
    } catch (err) {
      if (disposed.current || (err as { name?: string })?.name === "AbortError") return;
      setPhase("error");
      setErrorMsg("the oracle faltered.");
    }
  }

  const canSend =
    phase !== "streaming" && input.trim().length > 0 && (!TURNSTILE_ON || !!token);

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
                {m.role === "assistant" ? (
                  <p className="oracle-answer">
                    <MatrixText text={m.content} />
                  </p>
                ) : (
                  <p>{m.content}</p>
                )}
                {m.citations && m.citations.length > 0 && (
                  <p className="oracle-cites">
                    {m.citations.map((c, j) => (
                      <a key={j} href={c.url}>
                        [{j + 1}] {c.title}
                      </a>
                    ))}
                  </p>
                )}
                {m.role === "assistant" &&
                  (() => {
                    const cite = firstStation(m.citations);
                    return (
                      <>
                        {m.uiStation && (
                          <a className="oracle-descend" href={`/resume?station=${m.uiStation}`}>
                            <span aria-hidden>▾ </span>descend to {m.uiStation} in the Construct →
                          </a>
                        )}
                        {cite && cite !== m.uiStation && (
                          <a className="oracle-construct" href={`/resume?station=${cite}`}>
                            view in the Construct →
                          </a>
                        )}
                      </>
                    );
                  })()}
              </div>
            </li>
          ))}
        </ol>

        {phase === "streaming" && (
          <div className="oracle-msg assistant" aria-live="polite">
            <span className="oracle-role" aria-hidden>
              oracle ▸
            </span>
            <div className="oracle-body">
              <p className="oracle-thinking">
                <span className="oracle-thinking-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                consulting the grimoire…
              </p>
            </div>
          </div>
        )}

        {phase === "error" && (
          <p className="oracle-error" role="alert">
            {errorMsg}
          </p>
        )}

        {ctxLabel && (
          <div className="oracle-ctx">
            <span className="oracle-ctx-label">
              context: <b>{ctxLabel}</b> — sent with your question
            </span>
            <button
              type="button"
              className="oracle-ctx-clear"
              aria-label="clear context"
              onClick={() => {
                setContext(null);
                setCtxLabel(null);
                // sticky dismiss: strip the params so a tab-switch remount can't resurrect the chip
                try {
                  const u = new URL(window.location.href);
                  u.searchParams.delete("ctx");
                  u.searchParams.delete("about");
                  window.history.replaceState(null, "", u);
                } catch {
                  /* non-fatal */
                }
              }}
            >
              ×
            </button>
          </div>
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
            onFocus={() => setEngaged(true)}
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
          {TURNSTILE_ON &&
            (botUnavailable ? (
              <p className="oracle-note">bot check unavailable — the oracle needs it to answer.</p>
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
      </section>
    </div>
  );
}
