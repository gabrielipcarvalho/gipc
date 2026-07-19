"use client";

import { useEffect, useRef, useState } from "react";
import type { ShellResult } from "../../data/lab";

/* Safe sandbox shell terminal on /lab. Talks to POST /api/lab/shell (services/core) — a fixed-grammar,
   in-memory, provably NO-execution interpreter (internal/shell). Output is rendered as PLAIN TEXT only
   ({string} in JSX → auto-escaped; a <pre> preserves spacing) — NO dangerouslySetInnerHTML, no linkifier,
   no ANSI-to-HTML, no markdown. Honest offline/rate-limited/error states; the input stays retryable. */

// server-output lines are typed `string` so they can NEVER structurally become markup.
type Line = { id: number; kind: "cmd" | "out" | "sys"; text: string };

// cosmetic client mirror of the server's fixed allowlist (the server is authoritative); drives Tab-complete.
const CMDS = ["help", "motd", "banner", "whoami", "uname", "date", "echo", "clear", "pwd", "ls", "cd", "cat", "tree", "history"];
const CMD_MAX = 256;

export function ShellPanel() {
  const [lines, setLines] = useState<Line[]>([
    { id: 0, kind: "sys", text: "gipc safe sandbox — a fixed command grammar, zero arbitrary execution. type: help" },
  ]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("/");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [pending, setPending] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" }); // block:nearest (no smooth — JS motion escapes the RM reset)
  }, [lines]);

  const push = (kind: Line["kind"], text: string) => setLines((l) => [...l, { id: idRef.current++, kind, text }]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return; // in-flight: ignore Enter entirely (no stacked blank prompt lines)
    const raw = input;
    const cmd = raw.trim();
    setInput("");
    setHIdx(-1);
    push("cmd", raw);
    if (!cmd) return; // empty submit still echoes a bare prompt line (terminal-authentic), then stop
    setHistory((h) => [...h, cmd]);
    setPending(true);
    try {
      const res = await fetch("/api/lab/shell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd: cmd.slice(0, CMD_MAX), cwd }),
      });
      if (res.status === 503) {
        push("sys", "sandbox offline — the lab is disabled right now.");
      } else if (res.status === 429) {
        push("sys", "slow down — too many commands in a moment.");
      } else if (!res.ok) {
        push("sys", "the sandbox faltered — try again."); // any other non-2xx (400 etc.) → honest, re-enabled
      } else {
        const data = (await res.json()) as ShellResult;
        if (data.cleared) {
          setLines([]);
        } else if (data.output) {
          push("out", data.output.replace(/\n$/, ""));
        }
        setCwd(data.cwd || "/");
      }
    } catch {
      push("sys", "the sandbox faltered — try again.");
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      if (!input.trim()) return; // a11y escape hatch — empty input: Tab moves focus (no keyboard trap)
      const parts = input.split(/\s+/).filter(Boolean);
      if (parts.length !== 1) return; // only the first token completes; else Tab moves focus
      e.preventDefault();
      const matches = CMDS.filter((c) => c.startsWith(parts[0].toLowerCase()));
      if (matches.length === 1) setInput(matches[0] + " ");
      else if (matches.length > 1) push("out", matches.join("  "));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const i = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1);
      setHIdx(i);
      setInput(history[i]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hIdx < 0) return;
      const i = hIdx + 1;
      if (i >= history.length) {
        setHIdx(-1);
        setInput("");
      } else {
        setHIdx(i);
        setInput(history[i]);
      }
    }
  }

  return (
    <section className="lab-panel" aria-labelledby="shellp-h">
      <h2 id="shellp-h" className="lab-h">
        Sandbox shell
      </h2>
      <p className="lab-lead">
        A safe, read-only terminal — a fixed command grammar over an in-memory filesystem, with zero
        arbitrary execution. Try <code>help</code>, <code>ls</code>, <code>cat about.txt</code>, <code>tree</code>.
      </p>
      <div className="term-io shellp-term" onClick={() => inputRef.current?.focus()}>
        <div role="log" aria-label="shell output" className="shellp-log">
          {lines.map((l) =>
            l.kind === "cmd" ? (
              <div className="io-cmd" key={l.id}>
                <span className="prompt">visitor@gipc:{cwd}$</span> {l.text}
              </div>
            ) : l.kind === "sys" ? (
              <div className="io-sys" key={l.id}>
                {l.text}
              </div>
            ) : (
              <pre className="io-out shellp-out" key={l.id}>
                {l.text}
              </pre>
            ),
          )}
          <div ref={endRef} />
        </div>
        <form className="shellp-form" onSubmit={submit}>
          <label htmlFor="shellp-input" className="prompt">
            visitor@gipc:{cwd}$
          </label>
          <input
            id="shellp-input"
            ref={inputRef}
            className="shellp-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={CMD_MAX}
            readOnly={pending}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="shell command input"
          />
        </form>
      </div>
    </section>
  );
}
