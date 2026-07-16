"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sigil } from "./sigil";
import { MetricPanel } from "./components/MetricPanel";
import { castRipple, fitText, tiltHandlers } from "./components/motion";
import { applyTheme, currentTheme, THEME_IDS } from "../data/themes";
import { projects } from "../data/projects";
import { writeups } from "../data/writeups";

const tilt = tiltHandlers();

// `oracle <slug>` context namespaces — mirror OracleChat's parseCtx (server-validated regardless)
const PROJECT_SLUGS = new Set(projects.map((p) => p.slug));
const WRITEUP_SLUGS = new Set(writeups.map((w) => w.slug));
const ORACLE_STATIONS = new Set([
  "profile", "skills", "experience", "projects", "publications", "education", "honours",
]);
const ORACLE_PAGES = new Set([
  "work", "writeups", "resume", "timeline", "system", "lab", "infra", "status", "connect", "meet",
]);

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

// every command + alias the switch below understands — drives tab-completion + did-you-mean
export const KNOWN_COMMANDS = [
  "help", "whoami", "ls", "about", "scry", "system", "work", "grimoire", "writeups", "blog", "timeline",
  "experience", "resume", "lab", "operator", "oracle", "ward", "summon", "connect",
  "contact", "social", "meet", "call", "theme", "history", "restore", "clear", "exit",
]; // .hidden / cat kept OUT — the CTF trailhead stays off tab-complete + did-you-mean

// bounded Levenshtein (early-out above 2) for the did-you-mean hint
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[a.length];
}

// command handlers → return output lines (strings/JSX); `nav` navigates via the router
function runCommand(
  raw: string,
  ctx: { history: string[] },
): { out: React.ReactNode[]; clear?: boolean; nav?: string; theme?: string; restore?: boolean; ctf?: boolean } {
  const cmd = raw.trim().toLowerCase();
  if (!cmd) return { out: [] };
  const first = cmd.split(/\s+/)[0];
  switch (first) {
    case "help":
      return { out: [
        "navigate:  system · work · timeline · resume · connect",
        "inspect:   whoami · about · ls · theme · history",
        "arcane:    scry (observe) · summon (deploy) · ward (security) · oracle [slug] (ask AI) · grimoire (work)",
        "utility:   help · clear · Tab completes · ↑/↓ history",
      ] };
    case "history":
      return { out: ctx.history.length
        ? ctx.history.map((h, i) => `${String(i + 1).padStart(3, " ")}  ${h}`)
        : ["(history empty)"] };
    case "whoami":
      return { out: ["arcane — Gabriel Isaias Padua Carvalho · Software · DevOps · AI engineer · Gold Coast, AU"] };
    case "ls": {
      const all = /(^|\s)-a(\s|$)/.test(cmd);
      return { out: [
        all
          ? "system   work   timeline   lab   operator   resume   connect   .hidden ← the trailhead"
          : "system   work   timeline   lab   operator   resume   connect   .hidden",
      ] };
    }
    case ".hidden":
      return { out: [
        "decrypting .hidden …",
        <>flag: <b>{"gipc{arcane_operator_reads_the_grimoire}"}</b> — access granted.</>,
      ], ctf: true };
    case "cat": {
      const arg = cmd.split(/\s+/)[1] ?? "";
      if (arg === ".hidden") {
        return { out: [<>flag: <b>{"gipc{arcane_operator_reads_the_grimoire}"}</b> — access granted.</>], ctf: true };
      }
      return { out: ["usage: cat <file> — try `ls -a` first."] };
    }
    case "restore":
      return { out: ["telemetry pane restored."], restore: true };
    case "about":
    case "scry":
      return { out: ["I build real systems. This console runs on a box I operate — live telemetry, real deploys, a tool-using agent. Proof, not claims."] };
    case "system":
      return { out: [<>the operator surface → <b>/system</b>: topology, live metrics, deploy feed.</>], nav: "/system" };
    case "work":
    case "grimoire":
      return { out: [<>selected work → <b>/work</b>: gipc.dev (this) · Nina Nails · seismic U-Net · transformer market platform · drowning-detection (IEEE Access).</>], nav: "/work" };
    case "writeups":
    case "blog":
      return {
        out: [<>technical writeups → <b>/writeups</b>: how the Lab, the self-hosted infra, and the Construct are built.</>],
        nav: "/writeups",
      };
    case "timeline":
    case "experience":
      return { out: [<>career history → <b>/timeline</b>: roles + study, newest first.</>], nav: "/timeline" };
    case "resume":
      return { out: [<>living résumé → the Construct at <b>/resume</b> · downloadable PDF (preview on /connect).</>], nav: "/resume" };
    case "lab":
      return {
        out: [
          <>
            the lab — live, safe-by-construction infra demos: chaos (kill a pod, watch it heal) · load test
            (isolated target, live histogram) · events · rate-limit · API playground. → <b>/lab</b>
          </>,
        ],
        nav: "/lab",
      };
    case "operator":
    case "oracle": {
      // `oracle <slug>` deep-links with typed visitor context (project → station → writeup)
      const slug = cmd.split(/\s+/)[1] ?? "";
      if (slug) {
        const kind = PROJECT_SLUGS.has(slug)
          ? "project"
          : ORACLE_STATIONS.has(slug)
            ? "station"
            : WRITEUP_SLUGS.has(slug)
              ? "writeup"
              : ORACLE_PAGES.has(slug)
                ? "page"
                : null;
        if (kind) {
          return { out: [<>opening the oracle with context: <b>{slug}</b>…</>], nav: `/oracle?ctx=${kind}:${slug}` };
        }
        return { out: [<>unknown context &quot;{slug}&quot; — opening the oracle. → <b>/oracle</b></>], nav: "/oracle" };
      }
      return { out: [<>the oracle — a tool-using AI operator over my real infra: cited answers + a live trace. → <b>/oracle</b></>], nav: "/oracle" };
    }
    case "ward":
      return { out: ["ward: ufw deny-in · fail2ban · Cloudflare WAF · zero inbound ports (tunnel) · CIS-minded hardening."] };
    case "summon":
      return { out: ["summon: GitOps — push → GitHub Actions → GHCR → ArgoCD → k3s. deploy feed lands on /system."] };
    case "connect":
    case "contact":
      return { out: [<>arcan.e@gipc.dev · <a href="https://github.com/gabrielipcarvalho">github</a> · <a href="https://www.linkedin.com/in/gabriel-ipcarvalho">linkedin</a> → <b>/connect</b></>], nav: "/connect" };
    case "meet":
    case "call":
      return { out: [<>book a call → <b>/meet</b>: request a time (async-first, AEST). I&apos;ll confirm.</>], nav: "/meet" };
    case "social":
      return { out: [<><a href="https://github.com/gabrielipcarvalho">github.com/gabrielipcarvalho</a> · <a href="https://www.linkedin.com/in/gabriel-ipcarvalho">linkedin.com/in/gabriel-ipcarvalho</a></>] };
    case "theme": {
      const arg = cmd.split(/\s+/)[1] ?? "";
      if (!arg) {
        return { out: [<>themes → <b>arcane</b> · <b>matrix</b> · <b>amber</b> · <b>mono</b> · active: <b>{currentTheme()}</b> · apply: <b>theme &lt;name&gt;</b></>] };
      }
      if (THEME_IDS.includes(arg)) {
        return { out: [<>theme applied → <b>{arg}</b>.</>], theme: arg };
      }
      return { out: ["unknown theme — presets: arcane · matrix · amber · mono."] };
    }
    case "clear":
      return { out: [], clear: true };
    case "exit":
      return { out: ["you can check out any time you like, but you can never leave. (try 'help')"] };
    default: {
      let best: string | null = null;
      let bestD = 3;
      for (const c of KNOWN_COMMANDS) {
        const d = editDistance(first, c);
        if (d < bestD) { bestD = d; best = c; }
      }
      return { out: [best && bestD <= 2
        ? <>command not found: <b>{raw.trim()}</b> — did you mean <b>{best}</b>?</>
        : <>command not found: <b>{raw.trim()}</b> — try <b>help</b>.</>] };
    }
  }
}

export function Console() {
  const [phase, setPhase] = useState<"idle" | "booting" | "done">("idle");
  const [bootShown, setBootShown] = useState(0); // completed boot lines
  const [bootChars, setBootChars] = useState(0); // chars typed of the current boot line
  const [revealed, setRevealed] = useState(false); // metric bars + content in
  const [justRevealed, setJustRevealed] = useState(false); // one-shot sweep+glint window
  const [panelClosed, setPanelClosed] = useState(false); // closable telemetry pane (egg)
  const [input, setInput] = useState("");
  const [log, setLog] = useState<OutLine[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const bootTimers = useRef<number[]>([]); // pending boot timeouts — skip must cancel them
  const router = useRouter();

  // fit the hero wordmark to its container (scales DOWN only if it would overflow — no CLS)
  useEffect(() => {
    if (wordmarkRef.current) return fitText(wordmarkRef.current);
  }, []);

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
    let done = 0; // completed lines
    let ch = 0; // chars typed of line[done]
    const finale = () => {
      sessionStorage.setItem("gipc-booted", "1");
      setPhase("done");
      setJustRevealed(true);
      requestAnimationFrame(() => setRevealed(true));
    };
    // type the current line char-by-char, then advance — every timer joins bootTimers so
    // skipBoot() and the unmount cleanup cancel pending char-timers (no stale setState)
    const type = () => {
      const text = bootLines[done];
      if (ch < text.length) {
        ch += 1;
        setBootChars(ch);
        bootTimers.current.push(window.setTimeout(type, 6));
      } else {
        done += 1;
        setBootShown(done);
        if (done < bootLines.length) {
          ch = 0;
          setBootChars(0);
          bootTimers.current.push(window.setTimeout(type, 40));
        } else {
          bootTimers.current.push(window.setTimeout(finale, 220));
        }
      }
    };
    bootTimers.current.push(window.setTimeout(type, 120));
    const timers = bootTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const skipBoot = useCallback(() => {
    if (phase !== "booting") return;
    bootTimers.current.forEach(clearTimeout); // kill the chain — no stale finale re-fire
    bootTimers.current = [];
    sessionStorage.setItem("gipc-booted", "1");
    setPhase("done");
    setRevealed(true);
    setJustRevealed(true);
  }, [phase]);

  useEffect(() => {
    if (phase === "booting") {
      const onKey = () => skipBoot();
      window.addEventListener("keydown", onKey, { once: true });
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [phase, skipBoot]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: "nearest" }); }, [log]);

  // fallback clear for the one-shot sweep/glint: if animationend never fires (e.g. the
  // user flips reduced-motion ON mid-sweep, cancelling the animation), clear anyway so
  // the invisible surfaces can't ghost-replay if motion is re-enabled later
  useEffect(() => {
    if (!justRevealed) return;
    const t = window.setTimeout(() => setJustRevealed(false), 1000);
    return () => clearTimeout(t);
  }, [justRevealed]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = input;
    const trimmed = raw.trim();
    const nextHistory = trimmed ? [...history, trimmed] : history;
    const { out, clear, nav, theme, restore, ctf } = runCommand(raw, { history: nextHistory });
    setHistory(nextHistory);
    setHIdx(-1);
    setInput("");
    if (clear) { setLog([]); return; }
    const next: OutLine[] = [{ id: idRef.current++, kind: "cmd", text: raw }];
    for (const o of out) next.push({ id: idRef.current++, kind: "out", text: o });
    setLog((l) => [...l, ...next]);
    if (theme) applyTheme(theme);
    if (restore) setPanelClosed(false);
    if (ctf) { try { localStorage.setItem("gipc-ctf", "found"); } catch { /* private mode */ } }
    if (nav) router.push(nav);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && !e.shiftKey) {
      if (!input.trim()) return; // empty input: Tab keeps moving focus (a11y escape hatch)
      e.preventDefault();
      const parts = input.split(/\s+/).filter(Boolean);
      if (parts.length !== 1) return; // only the first token completes
      const tok = parts[0].toLowerCase();
      const matches = KNOWN_COMMANDS.filter((c) => c.startsWith(tok));
      if (matches.length === 1) {
        setInput(matches[0] + " ");
      } else if (matches.length > 1) {
        const entry: OutLine = { id: idRef.current++, kind: "out", text: matches.join("   ") };
        setLog((l) => [...l, entry]);
      }
    } else if (e.key === "ArrowUp") {
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
    <section
      className={`term ${revealed ? "revealed" : ""}${justRevealed ? " glint" : ""}`}
      aria-label="Operator console"
    >
      {justRevealed && (
        <span
          className="sweep"
          aria-hidden
          onAnimationEnd={(e) => {
            if (e.animationName === "sweepDown") setJustRevealed(false);
          }}
        />
      )}
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
            {bootShown < bootLines.length && (
              /* key by index so the node is REUSED as it completes (no fade-in replay) */
              <div className="boot-line" key={bootShown}>{bootLines[bootShown].slice(0, bootChars)}</div>
            )}
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

        <h1 className="wordmark" ref={wordmarkRef}>arcane</h1>
        <p className="tagline">the operator — backend · cloud · <span className="c">AI arts</span></p>
        <p className="bio">I build real systems. This site runs on infrastructure I operate — every metric, deploy and agent you see here is live, not a mockup.</p>

        <div className="chips">
          {chips.map(([cmd, desc]) => (
            <button
              className="chip"
              key={cmd}
              {...tilt}
              onClick={() => { setInput(cmd); inputRef.current?.focus(); }}
            >
              {cmd} <span className="c">{desc}</span>
            </button>
          ))}
        </div>

        {panelClosed ? (
          <p className="panel-scold" role="status">
            Aw — you closed the telemetry pane. type <b>restore</b> or{" "}
            <button type="button" className="link-btn" onClick={() => setPanelClosed(false)}>bring it back</button>.
          </p>
        ) : (
          <div className="panel-wrap">
            <button
              type="button"
              className="panel-close"
              aria-label="Close telemetry panel"
              onClick={() => setPanelClosed(true)}
            >
              ×
            </button>
            <MetricPanel metrics={metrics} revealed={revealed} countUp />
          </div>
        )}

        <div className="actions">
          <button
            className="btn btn-primary"
            type="button"
            onPointerDown={castRipple}
            onClick={() => { setInput("oracle"); inputRef.current?.focus(); }}
          >
            ▸ ask the oracle
            <span className="ripple-host" aria-hidden />
          </button>
          <button className="btn btn-ghost" type="button" onPointerDown={castRipple} onClick={() => { setInput("scry"); inputRef.current?.focus(); }}>
            trace my request
            <span className="ripple-host" aria-hidden />
          </button>
          <span className="kbd"><b>type</b> a command · try <b>help</b></span>
        </div>

        {/* interactive command line — role=log announces appended output politely */}
        <div className="term-io">
          <div role="log">
            {log.map((l) => (
              l.kind === "cmd"
                ? <div className="io-cmd" key={l.id}><span className="prompt">arcane@prod:~$</span> {l.text}</div>
                : <div className="io-out" key={l.id}>{l.text}</div>
            ))}
          </div>
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
