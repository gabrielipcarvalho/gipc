"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { constructKeyBlocked } from "./ConstructShell";
import { nearestStation, stationKeysOf, stationLerp, stationOffsets } from "../../data/construct-stations";

/* The Construct's immersive layer (lazy-loaded, client-only): glyph-rain canvas +
   scroll-descend camera + decode reveals + opt-in audio + a green/violet tint toggle.
   The résumé text stays in the DOM — this only positions [data-station] cards + draws rain.
   Perf: transforms/opacity only; rain budgeted ≤2ms/frame; canvas + audio clean up on unmount. */

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ACEFXZ<>_/\\|=+*";
const DECODE_MS = 400;
const LERP_FINE = 0.1; // AT's desktop constant
const LERP_COARSE = 0.5; // AT's touch constant
const FS = [
  // Sprint N: global ×0.65 slowdown — the rain read as frantic at full AT speeds
  { fs: 18, speed: 0.7 },
  { fs: 13, speed: 0.5 },
  { fs: 9, speed: 0.33 },
];

/* Sprint O — the helix (docs/design/construct-parity-audit.md). Constants derive from the
   Active Theory /work teardown (50°/item, drop 0.32×pane, camera-chase 0.2, entrance/exit ±1u
   over 15% progress), re-based to viewport units. Helix runs on fine pointers at tier ≥2 only;
   coarse/T0/T1/RM keep the flat descent — the fallback IS the previous shipped behaviour. */
const HELIX = {
  STEP_DEG: 50, // angular step per station
  RADIUS_VW: 0.55, // radius as fraction of viewport width…
  RADIUS_MAX: 860, // …capped in px
  DROP_VH: 0.3, // vertical drop per station (AT: 0.84u vs 2.6u pane ≈ 0.32)
  PERSPECTIVE: 1200, // px — plays AT's FOV-35 role
  CULL: 2.6, // |station distance| beyond which a card is parked offscreen
  LIFT: 44, // px toward the viewer for the focused card (O5)
  POSE_LERP: 0.2, // camera-pose chase (AT's camera lerp)
  DRIFT_FRAC: 0.15, // entrance/exit drift window (progress fraction)
  DRIFT_VH: 0.32, // drift amplitude
};
const smooth01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/* Framerate-normalized lerp alpha (AT: α' = 1−(1−α)^(dt·60Hz)) — constants stay "per 60Hz frame". */
const normAlpha = (a: number, dtMs: number): number => 1 - Math.pow(1 - a, dtMs / 16.667);

/* Device-tier budgets (AT-style). A cheap-signal detector picks T0 (lowest) → T3 (highest); the tier
   sets the PROACTIVE starting budget. The reactive per-frame loop (uniform 2ms / 0.3 floor) stays as a
   universal guardrail on top. T3 == the shipped constants exactly (density 1, 3 layers, dpr 2, rune
   0.015) → a true no-op on capable devices. `?gpu=t0..t3|high|low` overrides detection (testing). */
type Tier = 0 | 1 | 2 | 3;
type TierBudget = {
  layers: number; // how many FS[] rain layers to render (1..3)
  density: number; // STARTING active-column fraction; the adaptive loop only tunes DOWN from here
  dprCap: number; // devicePixelRatio ceiling for the canvas backing store
  runeRate: number; // per-cell probability of a sigil rune vs a glyph
};
const TIERS: Record<Tier, TierBudget> = {
  0: { layers: 1, density: 0.4, dprCap: 1, runeRate: 0 },
  1: { layers: 2, density: 0.6, dprCap: 1.5, runeRate: 0.008 },
  2: { layers: 3, density: 0.85, dprCap: 2, runeRate: 0.012 },
  3: { layers: 3, density: 1, dprCap: 2, runeRate: 0.015 },
};

/* Coarse GPU-capability proxy: MAX_TEXTURE_SIZE only (low-entropy, NOT UNMASKED_RENDERER → no
   fingerprint). One detached context, read then freed immediately; any failure → 0. */
function sniffGpu(): number {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return 0;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    if (max >= 16384) return 2;
    if (max >= 8192) return 1;
    return 0;
  } catch {
    return 0;
  }
}

/* Detect a device tier from cheap signals. Client-only (touches navigator/window) — call inside an
   effect, never at render. Missing signals contribute 0 → an unknown device lands at a safe middle. */
function detectTier(): Tier {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  } catch {
    /* ignore */
  }
  const cores = navigator.hardwareConcurrency || 0;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 0;
  let coarse = false;
  try {
    coarse = window.matchMedia("(pointer: coarse)").matches;
  } catch {
    /* ignore */
  }
  let score = 0;
  // Touch/mobile bias down: big.LITTLE SoCs inflate logical-core count and report a large
  // MAX_TEXTURE_SIZE yet are weak; the dpr²-fill + layer cost of a high tier is what the density-only
  // adaptive guardrail can't claw back. So the cores≥8 bonus is desktop-only and coarse costs −2.
  if (!coarse && cores >= 8) score += 2;
  else if (cores >= 4) score += 1;
  if (mem >= 8) score += 2;
  else if (mem >= 4) score += 1;
  if (coarse) score -= 2;
  score += sniffGpu(); // 0..2
  if (score >= 5) return 3;
  if (score >= 3) return 2;
  if (score >= 1) return 1;
  return 0;
}

/* `?gpu=t0..t3` (or `high`/`low`) test override → a fixed tier, else null (fall back to detection). */
function readGpuOverride(): Tier | null {
  try {
    const v = new URLSearchParams(window.location.search).get("gpu");
    if (!v) return null;
    const s = v.toLowerCase();
    if (s === "high") return 3;
    if (s === "low") return 0;
    const m = /^t([0-3])$/.exec(s);
    return m ? (Number(m[1]) as Tier) : null;
  } catch {
    return null;
  }
}

/* Rain colours per tint — JS literal strings (canvas fillStyle can't read CSS vars; the green
   precedent already hardcodes rgba). Violet mirrors the arcane --violet/--cyan values. */
type Tint = "green" | "violet";
const TINTS: Record<Tint, { color: string; head: string }[]> = {
  green: [
    { color: "rgba(0,255,65,0.9)", head: "#c8ffc8" },
    { color: "rgba(0,255,65,0.45)", head: "#9fdf9f" },
    { color: "rgba(0,255,65,0.22)", head: "#7fbf7f" },
  ],
  violet: [
    { color: "rgba(177,140,255,0.9)", head: "#e6dcff" },
    { color: "rgba(52,230,255,0.5)", head: "#bff0ff" },
    { color: "rgba(177,140,255,0.25)", head: "#c9b3ff" },
  ],
};

/* Hex-sigil rune, rendered at 3× the cell size and drawn scaled down → crisper (supersampled). The
   downscale quality is set on the MAIN canvas ctx (imageSmoothingQuality="high") where drawImage minifies
   this. MSDF was deferred: it needs a WebGL shader; a 2D-canvas drawImage of an MSDF atlas is blurrier. */
function makeRune(size: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const R = size * 3;
  c.width = c.height = R;
  const g = c.getContext("2d");
  if (!g) return c;
  const s = R / 100;
  g.strokeStyle = color;
  g.lineWidth = 7 * s;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath(); // hexagon
  const pts = [[50, 6], [88, 28], [88, 72], [50, 94], [12, 72], [12, 28]];
  pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
  g.closePath();
  g.stroke();
  g.beginPath(); // > chevron (centred on the sigil)
  g.moveTo(40 * s, 39 * s);
  g.lineTo(58 * s, 50 * s);
  g.lineTo(40 * s, 61 * s);
  g.stroke();
  g.beginPath(); // _ cursor
  g.moveTo(59 * s, 65 * s);
  g.lineTo(71 * s, 65 * s);
  g.stroke();
  return c;
}

const readTint = (): Tint => {
  // Sprint N: VIOLET is the default. The key is VERSIONED (tint2) because the old key was
  // auto-persisted on every mount — treating it as a choice would pin all returning visitors
  // to green. tint2 is written ONLY by the HUD toggle (a real user gesture).
  try {
    return localStorage.getItem("gipc-cst-tint2") === "green" ? "green" : "violet";
  } catch {
    return "violet";
  }
};
const readAudio = (): boolean => {
  try {
    return localStorage.getItem("gipc-audio") === "on";
  } catch {
    return false;
  }
};

export function Immersive({ rootRef }: { rootRef: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [tint, setTint] = useState<Tint>(readTint);
  const [audioOn, setAudioOn] = useState<boolean>(readAudio);

  const tintRef = useRef<Tint>(tint);
  const apiRef = useRef<{ rebuildRain: () => void; dejaVu: () => void } | null>(null);
  const tickRef = useRef<(() => void) | null>(null); // null when audio off → decode ticks no-op
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const silentRef = useRef<HTMLAudioElement | null>(null);
  const lastTickRef = useRef(0);
  const didMountTint = useRef(false);

  // --- audio (one persistent graph; gain-toggled; never rebuilt/closed per toggle) ---
  const ensureCtx = (): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const master = ctx.createGain();
      master.gain.value = 0;
      src.connect(lp).connect(master).connect(ctx.destination);
      src.start();
      ctxRef.current = ctx;
      masterRef.current = master;
      return ctx;
    } catch {
      return null;
    }
  };
  const rampMaster = (to: number) => {
    const ctx = ctxRef.current;
    const m = masterRef.current;
    if (!ctx || !m) return;
    const now = ctx.currentTime;
    m.gain.cancelScheduledValues(now);
    m.gain.setValueAtTime(m.gain.value, now);
    m.gain.linearRampToValueAtTime(to, now + 0.12);
  };
  // iOS mute-switch bypass: a silent, looping <audio> element flips WebKit's page-shared audio session to a
  // playback category that ignores the hardware mute switch, so the WebAudio graph rides along. The clip is
  // a same-origin static file (the prod CSP has no media-src → blob:/data: audio are blocked; /public 'self'
  // is allowed). play() runs on EVERY enable (a paused session can lapse back to "ambient"); the element is
  // created once. Trade-off: the loop may surface an OS "now-playing" control (paused on disable). Pure
  // zero-sample silence engages current iOS/WebKit; if a device ever needs it, one non-zero WAV sample is the
  // known fallback.
  const ensureSilentUnlock = () => {
    if (!silentRef.current) {
      const el = new Audio("/construct-silence.wav");
      el.loop = true;
      el.setAttribute("playsinline", ""); // harmless no-op on <audio>; belt-and-suspenders for WebKit
      silentRef.current = el;
    }
    void silentRef.current.play().catch(() => {}); // an autoplay reject is non-fatal — WebAudio path unchanged
    rootRef.current?.setAttribute("data-cst-unlock", ""); // test/debug hook (mirrors data-cst-tint)
  };
  const enableAudio = () => {
    const ctx = ensureCtx();
    if (!ctx) return;
    void ctx.resume();
    ensureSilentUnlock();
    rampMaster(0.04);
    tickRef.current = () => {
      const c = ctxRef.current;
      if (!c) return;
      const t = c.currentTime;
      if (t - lastTickRef.current < 0.08) return; // throttle the decode-tick burst
      lastTickRef.current = t;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = 520 + Math.random() * 240;
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    };
  };
  const disableAudio = () => {
    rampMaster(0);
    tickRef.current = null;
    silentRef.current?.pause(); // release the iOS session; the element is reused on re-enable
    rootRef.current?.removeAttribute("data-cst-unlock");
  };
  const toggleAudio = () => {
    const next = !audioOn;
    setAudioOn(next);
    try {
      localStorage.setItem("gipc-audio", next ? "on" : "off");
    } catch {
      /* private mode */
    }
    if (next) enableAudio();
    else disableAudio();
  };

  // persisted-on: can't start pre-gesture → arm a one-shot unlock on the first interaction
  useEffect(() => {
    if (!audioOn) return;
    const unlock = () => {
      enableAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // close the AudioContext exactly once, on unmount, guarded
  useEffect(
    () => () => {
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
      silentRef.current?.pause(); // stop the silent loop on leaving /resume (no object URL to revoke)
      silentRef.current = null;
    },
    [],
  );

  // --- tint: sync ref + data attr; rebuild rain on CHANGE (skip mount). Violet is the CSS
  // baseline, so the attribute marks the GREEN variant. No persist here — auto-persisting on
  // mount is what poisoned the old key; the toggle handler owns storage now. ---
  useEffect(() => {
    tintRef.current = tint;
    const root = rootRef.current;
    if (root) {
      if (tint === "green") root.setAttribute("data-cst-tint", "green");
      else root.removeAttribute("data-cst-tint");
    }
    if (didMountTint.current) {
      apiRef.current?.rebuildRain();
      apiRef.current?.dejaVu(); // A10 — the Matrix changed; let one column remember
    } else didMountTint.current = true;
  }, [tint, rootRef]);

  // --- CLS guard: position + HIDE the stations pre-paint, before the browser paints the immersive
  // commit. Static cards → position:fixed camera transforms is one big layout shift; hiding the cards
  // across the reposition frame excludes it from CLS (visibility:hidden ⇒ empty paint rect). The first
  // frame() un-hides them at the exact same fixed position (an appearance is not a shift). The opaque
  // rain-veil covers the ~16ms hidden window. Never runs under reduced motion (Immersive never mounts). ---
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const vh = window.innerHeight;
    const cam = window.scrollY;
    // position each camera station at its transform pre-paint (overrides the CSS 120vh default). Uses the
    // SAME hand-authored offsets as the first frame() (deterministic from the DOM) → no pre-paint drift.
    const stationCards = Array.from(root.querySelectorAll<HTMLElement>("[data-station]"));
    const offsets = stationOffsets(stationKeysOf(stationCards));
    stationCards.forEach((c, i) => (c.style.transform = `translate3d(0, ${(offsets[i] * vh - cam).toFixed(2)}px, 0)`));
    // Reveal target = EXACTLY the set the CSS hides (`.cst-card`), so hide/reveal can't drift out of sync.
    // Sprint O: the reveal moved INTO the main loop's first frame — the helix decides card poses only
    // once the tier is known (main effect), so revealing here could flash one elevator-posed frame.
    // The cards stay CSS-hidden until frame() has written its first (possibly helix) transforms.
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".cst-card"));
    // Immersive cards are scroll containers (max-height + overflow-y:auto) — keyboard users need a
    // focusable region to scroll them (axe scrollable-region-focusable), and a focusable region
    // needs a NAME (role=region + aria-label, derived from the card's own kicker/heading — never
    // hand-typed). role and label are set together or not at all: an unconditional role with a
    // missing label would be an unnamed region. Static mode never scrolls cards, so all of this
    // exists only while immersive is mounted.
    cards.forEach((c) => {
      c.setAttribute("tabindex", "0");
      const kicker = c.querySelector(".cst-kicker")?.textContent?.replace(/^\/\/\s*/, "") ?? "";
      const title = c.querySelector(".cst-title, .cst-name")?.textContent ?? "";
      const label = [kicker, title].filter(Boolean).join(" — ");
      if (label) {
        // ARIA-in-HTML: <header> (the identity card) doesn't allow role=region — group is the
        // allowed nameable role there; the 15 <article> cards get true region landmarks.
        c.setAttribute("role", c.tagName === "HEADER" ? "group" : "region");
        c.setAttribute("aria-label", label);
      }
    });
    return () => {
      cards.forEach((c) => {
        c.style.visibility = "";
        c.removeAttribute("tabindex");
        c.removeAttribute("role");
        c.removeAttribute("aria-label");
      });
    };
  }, [rootRef]);

  // --- main canvas effect (once) ---
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const spacer = spacerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !spacer || !ctx) {
      // canvas unavailable (privacy browser etc.) → no frame loop will ever run; reveal the
      // CSS-hidden cards immediately so the résumé is never blank.
      root?.querySelectorAll<HTMLElement>(".cst-card").forEach((c) => (c.style.visibility = "visible"));
      return;
    }

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-station]"));
    const stations = cards.length;
    let revealed = false;
    // ONE reveal, over the exact set the CSS hides (.cst-card) — every bail/fallback/first-frame
    // path calls this, so no card can be left invisible by selector drift between paths.
    const revealAll = () => {
      revealed = true;
      root.querySelectorAll<HTMLElement>(".cst-card").forEach((c) => (c.style.visibility = "visible"));
    };
    if (!stations) {
      revealAll(); // no stations to pose → nothing will ever run frame(); never leave cards hidden
      return;
    }
    // CLS-veil safety net: frame() is the primary revealer, but if rAF is throttled to zero
    // (recorded Sprint M lesson: automation) the résumé must never stay hidden. 400ms covers
    // the veil window; a normal first frame beats it easily.
    const revealFallback = window.setTimeout(() => {
      if (!revealed) revealAll();
    }, 400);

    // hand-authored camera stations: per-card cumulative vh offsets + per-station descent lerp.
    // Absent/empty config → offsets [0,1,2,…] + the global lerp → the code-derived uniform grid (today).
    const keys = stationKeysOf(cards);
    const offsets = stationOffsets(keys);

    // device-tier budget: `?gpu` override wins, else detect. Proactive start; the adaptive loop below
    // still tunes density DOWN. `data-cst-tier` is a QA/verify signal (removed on unmount).
    const tier = readGpuOverride() ?? detectTier();
    const budget = TIERS[tier];
    root.setAttribute("data-cst-tier", String(tier));

    let vh = window.innerHeight;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lerp = coarse ? LERP_COARSE : LERP_FINE;
    let cam = window.scrollY;
    let fullPass = true;

    // Sprint O: the helix — fine pointers at tier ≥2 only; everyone else keeps the flat descent.
    const helix = !coarse && tier >= 2 && stations >= 4;
    if (helix) root.setAttribute("data-cst-helix", "");
    let camIdx = 0; // continuous station index (helix camera), chased at POSE_LERP
    // reactive-rain state (A1 velocity · A2 part-around-focus · A3 rune surge · A10 déjà vu)
    let rainVel = 0;
    let surgeUntil = 0;
    let dejaCol = -1;
    let dejaUntil = 0;
    let focusRect: { l: number; r: number; t: number; b: number } | null = null;
    let bloomed: HTMLElement | null = null;
    let rectTick = 0;
    const refreshFocusRect = () => {
      const el = focusedIdx >= 0 ? cards[focusedIdx] : null;
      if (!el) {
        focusRect = null;
        return;
      }
      const b = el.getBoundingClientRect();
      focusRect = { l: b.left, r: b.right, t: b.top, b: b.bottom };
    };
    apiRef.current = {
      rebuildRain: () => buildRain(),
      dejaVu: () => {
        // A10 — "a change in the Matrix": one column visibly repeats itself for a beat.
        // drawRain force-draws the marked column, so a uniform pick is always visible.
        const cols = layers[0]?.cols ?? 0;
        if (!cols) return;
        dejaCol = (Math.random() * cols) | 0;
        dejaUntil = performance.now() + 900;
      },
    };

    /* continuous camera index from the lerped cam against the (non-uniform) station offsets —
       gaps stretch the scroll length of a segment, so hand-authored pacing survives on the helix */
    const camIndexOf = (camPx: number): number => {
      const pos = camPx / vh;
      if (pos <= offsets[0]) return 0;
      for (let i = 0; i < stations - 1; i++) {
        if (pos <= offsets[i + 1]) {
          const seg = offsets[i + 1] - offsets[i];
          return i + (seg > 0 ? (pos - offsets[i]) / seg : 0);
        }
      }
      return stations - 1;
    };
    camIdx = camIndexOf(cam); // seed at the REAL position — no station-0 swoosh on deep entry

    let lastW = 0;
    let lastH = 0;
    const layout = () => {
      if (window.innerWidth === lastW && window.innerHeight === lastH) return;
      lastW = window.innerWidth;
      lastH = window.innerHeight;
      vh = window.innerHeight;
      spacer.style.height = `${(offsets[stations - 1] + 1) * vh}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, budget.dprCap);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(vh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = "high"; // re-apply: canvas.width/height above reset the ctx to defaults
      buildRain();
      fullPass = true;
    };
    let resizeT = 0;
    const onResize = () => {
      window.clearTimeout(resizeT);
      resizeT = window.setTimeout(layout, 150);
    };

    /* ---- decode ---- */
    type Decode = { el: HTMLElement; final: string; raf: number };
    const decodes = new Map<HTMLElement, Decode>();
    const settle = (d: Decode) => {
      cancelAnimationFrame(d.raf);
      d.el.textContent = d.final;
      d.el.removeAttribute("aria-hidden");
      decodes.delete(d.el);
    };
    const settleAll = () => Array.from(decodes.values()).forEach(settle);
    const startDecode = (el: HTMLElement, delay: number) => {
      if (el.children.length > 0) return; // never wipe markup
      const prev = decodes.get(el);
      if (prev) settle(prev);
      const final = el.textContent ?? "";
      if (!final.trim()) return;
      tickRef.current?.(); // decode tick (no-op when audio off) — after the guards
      const d: Decode = { el, final, raf: 0 };
      decodes.set(el, d);
      el.setAttribute("aria-hidden", "true");
      const t0 = performance.now() + delay;
      const tick = (now: number) => {
        const p = (now - t0) / DECODE_MS;
        if (p >= 1) {
          settle(d);
          return;
        }
        if (p > 0) {
          const settled = Math.floor(p * final.length);
          let s = final.slice(0, settled);
          for (let i = settled; i < final.length; i++) {
            const ch = final[i];
            s += ch === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
          d.el.textContent = s;
        }
        d.raf = requestAnimationFrame(tick);
      };
      d.raf = requestAnimationFrame(tick);
    };

    let focusedIdx = -1;
    const setFocused = (idx: number) => {
      if (idx === focusedIdx) return;
      if (focusedIdx >= 0) cards[focusedIdx]?.classList.remove("is-focused");
      focusedIdx = idx;
      const card = cards[idx];
      if (!card) return;
      card.classList.add("is-focused");
      surgeUntil = performance.now() + 500; // A3 — the rain acknowledges navigation
      rectTick = 0; // A2 — re-read the focused rect promptly
      let i = 0;
      card
        .querySelectorAll<HTMLElement>(
          ".cst-name, .cst-label, .cst-title, .cst-body, .cst-dc, .cst-meta-line, .cst-note, .cst-bullets li",
        )
        .forEach((t) => startDecode(t, i++ * 60));
    };

    /* ---- glyph rain ---- */
    type Layer = { fs: number; speed: number; color: string; head: string; drops: number[]; cols: number; rune: HTMLCanvasElement };
    let layers: Layer[] = [];
    let density = budget.density;
    const buildRain = () => {
      const w = window.innerWidth;
      const palette = TINTS[tintRef.current];
      layers = palette.slice(0, budget.layers).map((p, i) => {
        const { fs, speed } = FS[i];
        const cols = Math.ceil(w / fs);
        return {
          fs,
          speed,
          color: p.color,
          head: p.head,
          cols,
          drops: Array.from({ length: cols }, () => Math.random() * (vh / fs)),
          rune: makeRune(fs, p.color),
        };
      });
    };

    const drawRain = () => {
      const now = performance.now();
      // A3 — rune surge: navigation briefly quadruples the sigil rate
      const runeRate = budget.runeRate * (now < surgeUntil ? 4 : 1);
      const dejaActive = now < dejaUntil;
      ctx.fillStyle = "rgba(2,8,2,0.09)";
      ctx.fillRect(0, 0, window.innerWidth, vh);
      for (const l of layers) {
        ctx.font = `${l.fs}px ui-monospace, monospace`;
        const top = l === layers[0];
        // Uniform column thinning (Bresenham accumulator): spread the `density` fraction of columns
        // ACROSS THE FULL WIDTH — never truncate to the left band (density<1 must not empty the right).
        // Seeded at 1-density/2 to centre the dither so column 0 can draw (no far-left blank strip).
        // At density 1 every column draws (identical to the shipped full-width rain).
        let sel = 1 - density / 2;
        for (let c = 0; c < l.cols; c++) {
          sel += density;
          const dejaHere = dejaActive && top && c === dejaCol;
          if (sel < 1 && !dejaHere) continue; // the déjà-vu column always draws (A10 must be visible)
          if (sel >= 1) sel -= 1;
          const x = c * l.fs;
          const y = l.drops[c] * l.fs;
          const deja = dejaActive && top && c === dejaCol;
          // A2 — the code makes way: columns crossing the focused card fall dimmed
          const parted = focusRect && x >= focusRect.l && x <= focusRect.r && y >= focusRect.t && y <= focusRect.b;
          if (parted) ctx.globalAlpha = 0.3;
          const isRune = !deja && Math.random() < runeRate;
          if (isRune) {
            ctx.drawImage(l.rune, x, y - l.fs, l.fs, l.fs); // 3× rune → scaled down
          } else {
            // A10 — déjà vu: the marked column repeats a deterministic sequence (row-keyed, so the
            // same glyphs visibly recur as it falls) and burns bright for the duration
            const g = deja
              ? GLYPHS[(c * 7 + Math.abs(Math.floor(l.drops[c])) * 3) % GLYPHS.length]
              : GLYPHS[(Math.random() * GLYPHS.length) | 0];
            ctx.fillStyle = deja || Math.random() < 0.12 ? l.head : l.color;
            ctx.fillText(g, x, y);
          }
          if (parted) ctx.globalAlpha = 1;
          // A1 — velocity: scroll speed feeds the fall rate (chased, so it settles after a flick)
          l.drops[c] += l.speed * (1 + rainVel);
          if (y > vh && Math.random() > 0.975) l.drops[c] = 0;
        }
      }
    };

    /* ---- main loop (Sprint O: helix camera + framerate-normalized damping) ---- */
    let raf = 0;
    let acc = 0;
    let frames = 0;
    let lastTs = 0;
    const frame = (ts: number) => {
      // read layout BEFORE any style writes this frame: last frame's flush is already done, so
      // this getBoundingClientRect forces no reflow and stays out of the perf-budget window
      if (rectTick <= 0) {
        refreshFocusRect();
        rectTick = 4;
      } else rectTick--;
      const t0 = performance.now();
      const dt = lastTs ? Math.min(ts - lastTs, 100) : 16.7;
      lastTs = ts;
      // touch keeps the snappy LERP_COARSE constant; fine pointers get the target station's descent lerp.
      const targetIdx = nearestStation(offsets, window.scrollY / vh);
      const frameLerp = coarse ? lerp : stationLerp(keys[targetIdx], lerp);
      const prevCam = cam;
      cam += (window.scrollY - cam) * normAlpha(frameLerp, dt);
      if (Math.abs(window.scrollY - cam) < 0.5) cam = window.scrollY;
      // A1 — rain velocity chases the camera's speed (≈2 at a hard flick, decays to 0 at rest)
      const instVel = Math.min(Math.abs(cam - prevCam) / (dt / 16.667) / (vh * 0.02), 2); // per-60Hz-frame units
      rainVel += (instVel - rainVel) * normAlpha(0.12, dt);
      if (helix) {
        camIdx += (camIndexOf(cam) - camIdx) * normAlpha(HELIX.POSE_LERP, dt);
        const R = Math.min(window.innerWidth * HELIX.RADIUS_VW, HELIX.RADIUS_MAX);
        const drop = vh * HELIX.DROP_VH;
        const p = stations > 1 ? camIdx / (stations - 1) : 0;
        // entrance/exit drift (AT: camera ±1u over the first/last 15% of progress)
        const drift =
          (1 - smooth01(p / HELIX.DRIFT_FRAC)) * vh * HELIX.DRIFT_VH -
          smooth01((p - (1 - HELIX.DRIFT_FRAC)) / HELIX.DRIFT_FRAC) * vh * HELIX.DRIFT_VH;
        for (let i = 0; i < stations; i++) {
          const card = cards[i];
          if (card === bloomed) continue; // the bloom owns its own geometry
          const r = i - camIdx;
          if (Math.abs(r) > HELIX.CULL) {
            if (card.dataset.cull !== "1") {
              card.style.transform = "translate3d(0, 160vh, 0)";
              card.dataset.cull = "1";
            }
            continue;
          }
          delete card.dataset.cull;
          const a = (r * HELIX.STEP_DEG * Math.PI) / 180;
          const x = Math.sin(a) * R;
          const z = (Math.cos(a) - 1) * R + (1 - Math.min(Math.abs(r), 1)) * HELIX.LIFT; // O5 lift
          const y = r * drop + drift;
          card.style.transform = `perspective(${HELIX.PERSPECTIVE}px) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${(-r * HELIX.STEP_DEG).toFixed(2)}deg)`;
        }
      } else {
        for (let i = 0; i < stations; i++) {
          const off = offsets[i] * vh - cam;
          if (!fullPass && Math.abs(off) > vh * 1.5) continue;
          cards[i].style.transform = `translate3d(0, ${off.toFixed(2)}px, 0)`;
        }
      }
      fullPass = false;
      if (!revealed) revealAll(); // first correctly-posed frame is painted next — lift the CLS veil
      const idx = nearestStation(offsets, cam / vh);
      if (helix ? Math.abs(idx - camIdx) < 0.5 : Math.abs(offsets[idx] * vh - cam) < vh * 0.5) setFocused(idx);
      drawRain();
      acc += performance.now() - t0;
      frames += 1;
      if (frames >= 30) {
        if (acc / frames > 2 && density > 0.3) density = Math.max(0.3, density - 0.2);
        acc = 0;
        frames = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    /* ---- O3/A7 — detail bloom: the focused card expands into the reading surface ---- */
    let bloomAcc = 0;
    let slamT = 0;
    let slamming: HTMLElement | null = null; // the card mid-CRT-slam (Escape must still be ours)
    let prevOverflow = "";
    let prevPadR = "";
    const unlockScroll = () => {
      document.documentElement.style.overflow = prevOverflow;
      document.documentElement.style.paddingRight = prevPadR;
    };
    const settleSlam = (el: HTMLElement) => {
      window.clearTimeout(slamT);
      el.classList.remove("is-bloomed", "is-slamming");
      if (slamming === el) slamming = null;
    };
    const closeBloom = () => {
      if (!bloomed) return;
      const el = bloomed;
      bloomed = null;
      slamming = el;
      el.classList.add("is-slamming"); // A7 — CRT slam
      // timer AND animationend both settle (whichever fires first) — no path leaves the card stuck
      slamT = window.setTimeout(() => settleSlam(el), 400);
      el.addEventListener("animationend", () => settleSlam(el), { once: true });
      cards.forEach((c) => (c.inert = false)); // release the modal containment
      unlockScroll();
      el.focus(); // hand focus back to the (still-focused) station card
    };
    const openBloom = (el: HTMLElement) => {
      if (bloomed || !helix) return;
      // a re-open within the slam window must not let the stale timeout strip the live bloom
      window.clearTimeout(slamT);
      slamming = null;
      cards.forEach((c) => c.classList.remove("is-bloomed", "is-slamming"));
      bloomed = el;
      bloomAcc = 0;
      el.style.transform = ""; // hand geometry to the CSS class; frame() skips this card meanwhile
      el.classList.add("is-bloomed");
      // modal semantics (CommandPalette precedent): background cards inert, focus moves in,
      // scroll locks with the prior values SAVED and the scrollbar gutter compensated
      cards.forEach((c) => {
        if (c !== el) c.inert = true;
      });
      const docEl = document.documentElement;
      prevOverflow = docEl.style.overflow;
      prevPadR = docEl.style.paddingRight;
      const gutter = window.innerWidth - docEl.clientWidth;
      if (gutter > 0) docEl.style.paddingRight = `${gutter}px`;
      docEl.style.overflow = "hidden";
      el.focus();
    };
    const onCardClick = (e: MouseEvent) => {
      if (bloomed) return;
      const t = e.target as HTMLElement;
      if (t.closest("a, button")) return; // links and buttons keep their day jobs
      const card = t.closest<HTMLElement>("[data-station]");
      if (card && cards.indexOf(card) === focusedIdx) openBloom(card);
    };
    const onWheelBloom = (e: WheelEvent) => {
      if (!bloomed) return;
      const dir: 1 | -1 = e.deltaY > 0 ? 1 : -1;
      // reading the bloom's own overflow is NOT a close gesture
      if (bloomed.contains(e.target as Node) && scrollable(bloomed, dir)) {
        bloomAcc = 0;
        return;
      }
      bloomAcc += Math.abs(e.deltaY);
      if (bloomAcc > 140) closeBloom(); // sustained overscroll closes (AT's scroll-to-close)
    };
    const onKeyBloom = (e: KeyboardEvent) => {
      if (constructKeyBlocked(e)) return; // the palette owns the keyboard while open
      if (e.key === "Escape" && (bloomed || slamming)) {
        // consume it in the CAPTURE phase — ConstructShell's Escape exits the whole Construct,
        // and a modal's Escape must never double as "leave the page"
        e.preventDefault();
        e.stopPropagation();
        closeBloom();
      } else if (e.key === "Enter" && !bloomed) {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest("a, button")) return; // links and buttons keep their day jobs
        const card = active?.closest<HTMLElement>("[data-station]");
        if (card && cards.indexOf(card) === focusedIdx) openBloom(card);
      }
    };
    root.addEventListener("click", onCardClick);
    window.addEventListener("wheel", onWheelBloom, { passive: true });
    window.addEventListener("keydown", onKeyBloom, true); // capture: beat the shell's Escape

    /* ---- keyboard: ArrowUp/Down = ±25vh, overflowing card reads first ---- */
    const scrollable = (card: HTMLElement | null | undefined, dir: 1 | -1): card is HTMLElement => {
      if (!card || card.scrollHeight <= card.clientHeight) return false;
      return dir > 0 ? card.scrollTop + card.clientHeight < card.scrollHeight - 1 : card.scrollTop > 0;
    };
    const onArrow = (e: KeyboardEvent, dir: 1 | -1) => {
      const focusCard = document.activeElement?.closest<HTMLElement>("[data-station]");
      if (scrollable(focusCard, dir)) return;
      e.preventDefault();
      const card = cards[focusedIdx];
      if (scrollable(card, dir)) {
        card.scrollBy({ top: dir * card.clientHeight * 0.8, behavior: "smooth" });
        return;
      }
      window.scrollBy({ top: dir * vh * 0.25, behavior: "smooth" });
    };
    const onKey = (e: KeyboardEvent) => {
      if (constructKeyBlocked(e)) return;
      if (e.key === "ArrowDown") onArrow(e, 1);
      else if (e.key === "ArrowUp") onArrow(e, -1);
    };
    const onFocusIn = (e: FocusEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-station]");
      if (!card) return;
      const idx = cards.indexOf(card);
      if (idx >= 0) window.scrollTo({ top: offsets[idx] * vh });
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    root.addEventListener("focusin", onFocusIn);
    layout();

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeT);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("click", onCardClick);
      window.removeEventListener("wheel", onWheelBloom);
      window.removeEventListener("keydown", onKeyBloom, true);
      window.clearTimeout(slamT);
      window.clearTimeout(revealFallback);
      closeBloom();
      unlockScroll();
      cards.forEach((c) => (c.inert = false));
      root.removeAttribute("data-cst-helix");
      settleAll();
      if (focusedIdx >= 0) cards[focusedIdx]?.classList.remove("is-focused");
      cards.forEach((c) => {
        c.style.transform = "";
        c.style.visibility = ""; // clear the CLS-guard in case unmount raced the first frame()
        delete c.dataset.cull;
        c.classList.remove("is-bloomed", "is-slamming");
      });
      root.removeAttribute("data-cst-tier");
      apiRef.current = null;
    };
  }, [rootRef]);

  return (
    <>
      <canvas ref={canvasRef} className="cst-rain" aria-hidden />
      <div ref={spacerRef} className="cst-spacer" aria-hidden />
      <div className="cst-hud">
        <button type="button" className="cst-hud-btn" aria-pressed={audioOn} onClick={toggleAudio}>
          audio {audioOn ? "on" : "off"}
        </button>
        <button
          type="button"
          className="cst-hud-btn"
          aria-pressed={tint === "green"} /* green is the opt-in variant — pressed tracks it, like audio */
          onClick={() =>
            setTint((t) => {
              const n = t === "violet" ? "green" : "violet";
              try {
                localStorage.setItem("gipc-cst-tint2", n); // user gesture — the only writer
              } catch {
                /* private mode */
              }
              return n;
            })
          }
        >
          {tint === "violet" ? "violet" : "green"} rain
        </button>
      </div>
    </>
  );
}
