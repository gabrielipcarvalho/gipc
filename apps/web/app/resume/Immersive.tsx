"use client";

import { useEffect, useRef } from "react";
import { constructKeyBlocked } from "./ConstructShell";

/* The Construct's immersive layer (lazy-loaded, client-only): glyph-rain canvas +
   scroll-descend camera + decode reveals. The résumé text itself stays in the DOM —
   this module only positions the existing [data-station] cards and draws rain.

   Perf contract: transforms/opacity only; rain + card pass budgeted ≤2ms/frame with
   stepwise density degradation; everything cleaned up on unmount. */

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ACEFXZ<>_/\\|=+*";
const DECODE_MS = 400;
const LERP_FINE = 0.1; // AT's desktop constant
const LERP_COARSE = 0.5; // AT's touch constant

/* Pre-render the hex-sigil rune (polygon + chevron + underscore) at a cell size —
   the brand glyph mixed into the rain at low frequency. */
function makeRune(size: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  const s = size / 100;
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

export function Immersive({ rootRef }: { rootRef: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const spacer = spacerRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !spacer || !ctx) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-station]"));
    const stations = cards.length;
    if (!stations) return;

    /* ---- camera / station geometry (single unit source: innerHeight px) ---- */
    let vh = window.innerHeight;
    const lerp = window.matchMedia("(pointer: coarse)").matches ? LERP_COARSE : LERP_FINE;
    let cam = window.scrollY; // no fly-through when scroll is restored mid-shaft
    let fullPass = true; // first frame (and resizes) position every card

    let lastW = 0;
    let lastH = 0;
    const layout = () => {
      // iOS fires resize continuously during URL-bar collapse — skip no-op layouts
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

    /* ---- decode (textContent scramble; settle-on-cancel invariant) ---- */
    type Decode = { el: HTMLElement; final: string; raf: number };
    const decodes = new Map<HTMLElement, Decode>();
    const settle = (d: Decode) => {
      cancelAnimationFrame(d.raf);
      d.el.textContent = d.final; // ALWAYS restore the verbatim string
      d.el.removeAttribute("aria-hidden");
      decodes.delete(d.el);
    };
    const settleAll = () => Array.from(decodes.values()).forEach(settle);
    const startDecode = (el: HTMLElement, delay: number) => {
      if (el.children.length > 0) return; // mixed content (strong/a children) — never wipe markup
      const prev = decodes.get(el);
      if (prev) settle(prev);
      const final = el.textContent ?? "";
      if (!final.trim()) return;
      const d: Decode = { el, final, raf: 0 };
      decodes.set(el, d);
      el.setAttribute("aria-hidden", "true"); // transient — SR never reads scramble glyphs
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
          ".cst-name, .cst-label, .cst-title, .cst-body, .cst-meta-line, .cst-note, .cst-bullets li",
        )
        .forEach((t) => startDecode(t, i++ * 60));
    };

    /* ---- glyph rain ---- */
    type Layer = {
      fs: number;
      speed: number;
      color: string;
      head: string;
      drops: number[];
      cols: number;
      rune: HTMLCanvasElement;
    };
    let layers: Layer[] = [];
    let density = 1; // frame-budget degradation: 1 → 0.8 → … → 0.3
    const buildRain = () => {
      const w = window.innerWidth;
      layers = [
        { fs: 18, speed: 1.1, color: "rgba(0,255,65,0.9)", head: "#c8ffc8" },
        { fs: 13, speed: 0.75, color: "rgba(0,255,65,0.45)", head: "#9fdf9f" },
        { fs: 9, speed: 0.5, color: "rgba(0,255,65,0.22)", head: "#7fbf7f" },
      ].map((l) => {
        const cols = Math.ceil(w / l.fs);
        return {
          ...l,
          cols,
          drops: Array.from({ length: cols }, () => Math.random() * (vh / l.fs)),
          rune: makeRune(l.fs, l.color),
        };
      });
    };

    const drawRain = () => {
      ctx.fillStyle = "rgba(2,8,2,0.09)"; // trailing fade
      ctx.fillRect(0, 0, window.innerWidth, vh);
      for (const l of layers) {
        ctx.font = `${l.fs}px ui-monospace, monospace`;
        const active = Math.floor(l.cols * density);
        for (let c = 0; c < active; c++) {
          const y = l.drops[c] * l.fs;
          const isRune = Math.random() < 0.015;
          if (isRune) {
            ctx.drawImage(l.rune, c * l.fs, y - l.fs);
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

    /* ---- main loop with frame budget ---- */
    let raf = 0;
    let acc = 0;
    let frames = 0;
    const frame = () => {
      const t0 = performance.now();
      cam += (window.scrollY - cam) * lerp;
      if (Math.abs(window.scrollY - cam) < 0.5) cam = window.scrollY;

      for (let i = 0; i < stations; i++) {
        const off = i * vh - cam;
        if (!fullPass && Math.abs(off) > vh * 1.5) continue; // cull writes only — no visibility:hidden
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

    /* ---- keyboard: ArrowUp/Down = ±25vh — but an overflowing card reads first.
       Yield to the browser when focus sits inside a still-scrollable card; when no
       card holds focus (Safari never focuses scroll containers), scroll the FOCUSED
       station's overflow ourselves before moving the camera, so clipped bullets are
       always keyboard-reachable. ---- */
    const scrollable = (card: HTMLElement | null | undefined, dir: 1 | -1): card is HTMLElement => {
      if (!card || card.scrollHeight <= card.clientHeight) return false;
      return dir > 0
        ? card.scrollTop + card.clientHeight < card.scrollHeight - 1
        : card.scrollTop > 0;
    };
    const onArrow = (e: KeyboardEvent, dir: 1 | -1) => {
      const focusCard = document.activeElement?.closest<HTMLElement>("[data-station]");
      if (scrollable(focusCard, dir)) return; // browser scrolls the focused card itself
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

    /* ---- focus sync: Tab into a deep card snaps the camera to its station ---- */
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
      settleAll(); // cards can never be left scrambled
      if (focusedIdx >= 0) cards[focusedIdx]?.classList.remove("is-focused");
      cards.forEach((c) => (c.style.transform = ""));
    };
  }, [rootRef]);

  return (
    <>
      <canvas ref={canvasRef} className="cst-rain" aria-hidden />
      <div ref={spacerRef} className="cst-spacer" aria-hidden />
    </>
  );
}
