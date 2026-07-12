"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sigil } from "./sigil";

/* M1 Console — interactive arcane operator console.
   Metric values are placeholders until M3 wires real telemetry. */
const metrics = [
  { k: "web", pct: 82, v: "12 ms" },
  { k: "api", pct: 74, v: "142 rps" },
  { k: "ai", pct: 66, v: "agent up" },
  { k: "db", pct: 88, v: "3.4 ms" },
];

const chips: [string, string][] = [
  ["scry", "observe"],
  ["summon", "deploy"],
  ["ward", "security"],
  ["oracle", "ask AI"],
  ["grimoire", "work"],
];

const bootLines = [
  "POST arcane@prod — self-hosted operator console",
  "[ok] kernel · zen · 16GB · k3s ready",
  "[ok] services healthy · tls valid",
  "[ok] agent warm · tunnel up",
  "booting portfolio…",
];

type OutLine = { id: number; kind: "cmd" | "out"; text: React.ReactNode };

// command handlers → return output lines (strings/JSX); `nav` navigates via the router
function runCommand(raw: string): { out: React.ReactNode[]; clear?: boolean; nav?: string } {
  const cmd = raw.trim().toLowerCase();
  if (!cmd) return { out: [] };
  const first = cmd.split(/\s+/)[0];
  switch (first) {
    case "help":
      return { out: [
        "commands: whoami · ls · about · system · work · resume · lab · operator · connect · social · clear",
        "arcane aliases: scry (observe) · summon (deploy) · ward (security) · oracle (ask AI) · grimoire (work)",
      ] };
    case "whoami":
      return { out: ["arcane — Gabriel Isaias Padua Carvalho · Software · DevOps · AI engineer · Gold Coast, AU"] };
    case "ls":
      return { out: ["system   work   lab   operator   resume   connect   .hidden"] };
    case "about":
    case "scry":
      return { out: ["I build real systems. This console runs on a box I operate — live telemetry, real deploys, a tool-using agent. Proof, not claims."] };
    case "system":
      return { out: [<>the operator surface → <b>/system</b>: topology, live metrics, deploy feed.</>], nav: "/system" };
    case "work":
    case "grimoire":
      return { out: [<>selected work → <b>/work</b>: gipc.dev (this) · Nina Nails · seismic U-Net · transformer market platform · drowning-detection (IEEE Access).</>], nav: "/work" };
    case "resume":
      return { out: [<>living résumé → the Construct at <b>/resume</b> · signed PDF available on request.</>], nav: "/resume" };
    case "lab":
      return { out: ["the lab: sandbox shell · load tests · chaos demos — hardened, coming in a later drop."] };
    case "operator":
    case "oracle":
      return { out: ["the oracle — a tool-using AI operator over my real infra. wiring up (M4). find it on /system.", <>opening <b>/system</b>…</>], nav: "/system" };
    case "ward":
      return { out: ["ward: ufw deny-in · fail2ban · Cloudflare WAF · zero inbound ports (tunnel) · CIS-minded hardening."] };
    case "summon":
      return { out: ["summon: GitOps — push → GitHub Actions → GHCR → ArgoCD → k3s. deploy feed lands on /system."] };
    case "connect":
    case "contact":
      return { out: [<>arcan.e@gipc.dev · <a href="https://github.com/gabrielipcarvalho">github</a> · <a href="https://www.linkedin.com/in/gabriel-ipcarvalho">linkedin</a> → <b>/connect</b></>], nav: "/connect" };
    case "social":
      return { out: [<><a href="https://github.com/gabrielipcarvalho">github.com/gabrielipcarvalho</a> · <a href="https://www.linkedin.com/in/gabriel-ipcarvalho">linkedin.com/in/gabriel-ipcarvalho</a></>] };
    case "theme":
      return { out: ["theme: arcane (violet #b18cff / cyan #34e6ff). theme studio — later."] };
    case "clear":
      return { out: [], clear: true };
    case "exit":
      return { out: ["you can check out any time you like, but you can never leave. (try 'help')"] };
    default:
      return { out: [<>command not found: <b>{raw.trim()}</b> — try <b>help</b>.</>] };
  }
}

export function Console() {
  const [phase, setPhase] = useState<"idle" | "booting" | "done">("idle");
  const [bootShown, setBootShown] = useState(0); // how many boot lines revealed
  const [revealed, setRevealed] = useState(false); // metric bars + content in
  const [input, setInput] = useState("");
  const [log, setLog] = useState<OutLine[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // (Focusing this input after the palette's "open console" is owned by CommandPalette's
  // close-cleanup + RouteFocus, which target #console-input — see those components.)

  // boot sequence (client only, once per session, reduced-motion aware)
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const booted = sessionStorage.getItem("gipc-booted");
    if (reduce || booted) {
      setPhase("done");
      setRevealed(true);
      return;
    }
    setPhase("booting");
    let i = 0;
    const timers: number[] = [];
    const step = () => {
      i += 1;
      setBootShown(i);
      if (i < bootLines.length) {
        timers.push(window.setTimeout(step, 240));
      } else {
        timers.push(window.setTimeout(() => {
          sessionStorage.setItem("gipc-booted", "1");
          setPhase("done");
          requestAnimationFrame(() => setRevealed(true));
        }, 420));
      }
    };
    timers.push(window.setTimeout(step, 220));
    return () => timers.forEach(clearTimeout);
  }, []);

  const skipBoot = useCallback(() => {
    if (phase !== "booting") return;
    sessionStorage.setItem("gipc-booted", "1");
    setPhase("done");
    setRevealed(true);
  }, [phase]);

  useEffect(() => {
    if (phase === "booting") {
      const onKey = () => skipBoot();
      window.addEventListener("keydown", onKey, { once: true });
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [phase, skipBoot]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: "nearest" }); }, [log]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = input;
    const { out, clear, nav } = runCommand(raw);
    setHistory((h) => (raw.trim() ? [...h, raw] : h));
    setHIdx(-1);
    setInput("");
    if (clear) { setLog([]); return; }
    const next: OutLine[] = [{ id: idRef.current++, kind: "cmd", text: raw }];
    for (const o of out) next.push({ id: idRef.current++, kind: "out", text: o });
    setLog((l) => [...l, ...next]);
    if (nav) router.push(nav);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHIdx((i) => {
        const ni = i < 0 ? history.length - 1 : Math.max(0, i - 1);
        if (history[ni] !== undefined) setInput(history[ni]);
        return ni;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHIdx((i) => {
        if (i < 0) return -1;
        const ni = i + 1;
        if (ni >= history.length) { setInput(""); return -1; }
        setInput(history[ni]); return ni;
      });
    }
  };

  return (
    <section className={`term ${revealed ? "revealed" : ""}`} aria-label="Operator console">
      <header className="term-bar">
        <div className="dots" aria-hidden><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
        <Sigil className="sigil" />
        <span className="bar-path">arcane@prod : ~/portfolio</span>
        <div className="bar-meta">
          <span className="pulse" aria-hidden /> online
          <span className="sep">·</span> p99 12ms
          <span className="sep rps">·</span> <span className="rps">142 rps</span>
        </div>
      </header>

      <div className="term-body" onClick={() => inputRef.current?.focus()}>
        {phase === "booting" && (
          <button className="boot" onClick={skipBoot} aria-label="Skip boot sequence">
            {bootLines.slice(0, bootShown).map((l, i) => (
              <div className="boot-line" key={i}>{l}</div>
            ))}
            <div className="boot-skip">press any key to skip</div>
          </button>
        )}

        <p className="line"><span className="prompt">arcane@prod:~$</span> ./boot --portfolio</p>
        <div className="checks">
          <span className="chk"><b>✓</b> services healthy</span>
          <span className="chk"><b>✓</b> agent warm</span>
          <span className="chk"><b>✓</b> tls valid</span>
          <span className="chk"><b>✓</b> last deploy #482 · 3h ago</span>
        </div>
        <p className="line whoami"><span className="prompt">arcane@prod:~$</span> whoami</p>

        <h1 className="wordmark">arcane</h1>
        <p className="tagline">the operator — backend · cloud · <span className="c">AI arts</span></p>
        <p className="bio">I build real systems. This site runs on infrastructure I operate — every metric, deploy and agent you see here is live, not a mockup.</p>

        <div className="chips">
          {chips.map(([cmd, desc]) => (
            <button className="chip" key={cmd} onClick={() => { setInput(cmd); inputRef.current?.focus(); }}>
              {cmd} <span className="c">{desc}</span>
            </button>
          ))}
        </div>

        <div className="panel" role="group" aria-label="Live service metrics (placeholder)">
          {metrics.map((m) => (
            <div className="metric" key={m.k}>
              <span className="k">{m.k}</span>
              <span className="track"><span className="fill" style={{ width: revealed ? `${m.pct}%` : "0%" }} /></span>
              <span className="v">{m.v}</span>
            </div>
          ))}
        </div>

        <div className="actions">
          <button className="btn btn-primary" type="button" onClick={() => { setInput("oracle"); inputRef.current?.focus(); }}>▸ ask the oracle</button>
          <button className="btn btn-ghost" type="button" onClick={() => { setInput("scry"); inputRef.current?.focus(); }}>trace my request</button>
          <span className="kbd"><b>type</b> a command · try <b>help</b></span>
        </div>

        {/* interactive command line */}
        <div className="term-io">
          {log.map((l) => (
            l.kind === "cmd"
              ? <div className="io-cmd" key={l.id}><span className="prompt">arcane@prod:~$</span> {l.text}</div>
              : <div className="io-out" key={l.id}>{l.text}</div>
          ))}
          <div ref={logEndRef} />
          <form className="io-input" onSubmit={submit}>
            <span className="prompt">arcane@prod:~$</span>
            <input
              ref={inputRef}
              id="console-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false} autoComplete="off" autoCapitalize="off"
              aria-label="Console command input"
              placeholder="help"
            />
          </form>
        </div>
      </div>
    </section>
  );
}
