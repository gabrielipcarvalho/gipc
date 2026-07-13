"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { constructKeyBlocked } from "./ConstructShell";

/* The Construct's immersive layer (lazy-loaded, client-only): glyph-rain canvas +
   scroll-descend camera + decode reveals + opt-in audio + a green/violet tint toggle.
   The résumé text stays in the DOM — this only positions [data-station] cards + draws rain.
   Perf: transforms/opacity only; rain budgeted ≤2ms/frame; canvas + audio clean up on unmount. */

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ACEFXZ<>_/\\|=+*";
const DECODE_MS = 400;
const LERP_FINE = 0.1; // AT's desktop constant
const LERP_COARSE = 0.5; // AT's touch constant
const FS = [
  { fs: 18, speed: 1.1 },
  { fs: 13, speed: 0.75 },
  { fs: 9, speed: 0.5 },
];

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

/* Hex-sigil rune, rendered at 2× the cell size and drawn scaled down → crisper (supersampled). */
function makeRune(size: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const R = size * 2;
  c.width = c.height = R;
  const g = c.getContext("2d");
  if (!g) return c;
  const s = R / 100;
  g.strokeStyle = color;
  g.lineWidth = 8 * s;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath(); // hexagon
  const pts = [[50, 6], [88, 28], [88, 72], [50, 94], [12, 72], [12, 28]];
  pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
  g.closePath();
  g.stroke();
  g.beginPath(); // > chevron
  g.moveTo(38 * s, 38 * s);
  g.lineTo(56 * s, 50 * s);
  g.lineTo(38 * s, 62 * s);
  g.stroke();
  g.beginPath(); // _ cursor
  g.moveTo(60 * s, 64 * s);
  g.lineTo(70 * s, 64 * s);
  g.stroke();
  return c;
}

const readTint = (): Tint => {
  try {
    return localStorage.getItem("gipc-cst-tint") === "violet" ? "violet" : "green";
  } catch {
    return "green";
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
  const apiRef = useRef<{ rebuildRain: () => void } | null>(null);
  const tickRef = useRef<(() => void) | null>(null); // null when audio off → decode ticks no-op
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
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
  const enableAudio = () => {
    const ctx = ensureCtx();
    if (!ctx) return;
    void ctx.resume();
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
    },
    [],
  );

  // --- tint: sync ref + data attr + persist; rebuild rain on CHANGE (skip mount) ---
  useEffect(() => {
    tintRef.current = tint;
    const root = rootRef.current;
    if (root) {
      if (tint === "violet") root.setAttribute("data-cst-tint", "violet");
      else root.removeAttribute("data-cst-tint");
    }
    try {
      localStorage.setItem("gipc-cst-tint", tint);
    } catch {
      /* private mode */
    }
    if (didMountTint.current) apiRef.current?.rebuildRain();
    else didMountTint.current = true;
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
    // position each camera station at its transform pre-paint (overrides the CSS 120vh default)
    root
      .querySelectorAll<HTMLElement>("[data-station]")
      .forEach((c, i) => (c.style.transform = `translate3d(0, ${(i * vh - cam).toFixed(2)}px, 0)`));
    // Reveal target = EXACTLY the set the CSS hides (`.cst-card`), so hide/reveal can't drift out of sync.
    // The cards are held invisible by CSS `[data-mode=immersive] .cst-card{visibility:hidden}` from the
    // first immersive paint, so NO wrong-position frame is ever visible; we reveal only AFTER the positioned
    // frame has painted → the static→immersive relayout contributes ~0 to CLS.
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".cst-card"));
    const raf = requestAnimationFrame(() => cards.forEach((c) => (c.style.visibility = "visible")));
    return () => {
      cancelAnimationFrame(raf);
      cards.forEach((c) => (c.style.visibility = ""));
    };
  }, [rootRef]);

  // --- main canvas effect (once) ---
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const spacer = spacerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !spacer || !ctx) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-station]"));
    const stations = cards.length;
    if (!stations) return;

    let vh = window.innerHeight;
    const lerp = window.matchMedia("(pointer: coarse)").matches ? LERP_COARSE : LERP_FINE;
    let cam = window.scrollY;
    let fullPass = true;

    let lastW = 0;
    let lastH = 0;
    const layout = () => {
      if (window.innerWidth === lastW && window.innerHeight === lastH) return;
      lastW = window.innerWidth;
      lastH = window.innerHeight;
      vh = window.innerHeight;
      spacer.style.height = `${stations * vh}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(vh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    let density = 1;
    const buildRain = () => {
      const w = window.innerWidth;
      const palette = TINTS[tintRef.current];
      layers = palette.map((p, i) => {
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
    apiRef.current = { rebuildRain: buildRain };

    const drawRain = () => {
      ctx.fillStyle = "rgba(2,8,2,0.09)";
      ctx.fillRect(0, 0, window.innerWidth, vh);
      for (const l of layers) {
        ctx.font = `${l.fs}px ui-monospace, monospace`;
        const active = Math.floor(l.cols * density);
        for (let c = 0; c < active; c++) {
          const y = l.drops[c] * l.fs;
          const isRune = Math.random() < 0.015;
          if (isRune) {
            ctx.drawImage(l.rune, c * l.fs, y - l.fs, l.fs, l.fs); // 2× rune → scaled down
          } else {
            const g = GLYPHS[(Math.random() * GLYPHS.length) | 0];
            ctx.fillStyle = Math.random() < 0.12 ? l.head : l.color;
            ctx.fillText(g, c * l.fs, y);
          }
          l.drops[c] += l.speed;
          if (y > vh && Math.random() > 0.975) l.drops[c] = 0;
        }
      }
    };

    /* ---- main loop ---- */
    let raf = 0;
    let acc = 0;
    let frames = 0;
    const frame = () => {
      const t0 = performance.now();
      cam += (window.scrollY - cam) * lerp;
      if (Math.abs(window.scrollY - cam) < 0.5) cam = window.scrollY;
      for (let i = 0; i < stations; i++) {
        const off = i * vh - cam;
        if (!fullPass && Math.abs(off) > vh * 1.5) continue;
        cards[i].style.transform = `translate3d(0, ${off.toFixed(2)}px, 0)`;
      }
      fullPass = false;
      const idx = Math.round(cam / vh);
      if (idx >= 0 && idx < stations && Math.abs(idx * vh - cam) < vh * 0.5) setFocused(idx);
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
      if (idx >= 0) window.scrollTo({ top: idx * vh });
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
      settleAll();
      if (focusedIdx >= 0) cards[focusedIdx]?.classList.remove("is-focused");
      cards.forEach((c) => {
        c.style.transform = "";
        c.style.visibility = ""; // clear the CLS-guard in case unmount raced the first frame()
      });
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
          aria-pressed={tint === "violet"}
          onClick={() => setTint((t) => (t === "violet" ? "green" : "violet"))}
        >
          {tint === "violet" ? "violet" : "green"} rain
        </button>
      </div>
    </>
  );
}
