"use client";

import { useEffect, useRef } from "react";

/* Matrix decode reveal — the same glyph-scramble→latin effect the Construct uses, applied to a captured
   answer. Resolves left-to-right (char → word → line naturally): settled chars are real, the tail scrambles
   through arcane glyphs. Updates textContent via a ref (no per-frame React re-render, like Immersive).
   a11y: the real text lives in an sr-only span (announced once by the parent live region); the glyph layer
   is aria-hidden decoration. Reduced-motion → the text just appears. */

// mirrors GLYPHS in resume/Immersive.tsx
const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ACEFXZ<>_/\\|=+*";
const MS_PER_CHAR = 14;
const MIN_MS = 450;
const MAX_MS = 2600;

export function MatrixText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = text; // no animation — already the final text from JSX, keep it
      return;
    }
    const dur = Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHAR));
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      const settled = Math.floor(p * text.length);
      let s = text.slice(0, settled);
      for (let i = settled; i < text.length; i++) {
        const ch = text[i];
        s += ch === " " || ch === "\n" ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = s;
      if (p < 1) raf = requestAnimationFrame(step);
      else el.textContent = text;
    };
    raf = requestAnimationFrame(step);
    // rAF is paused in a backgrounded tab — this timer (which still fires) guarantees the text resolves
    const settle = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      el.textContent = text;
    }, dur + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [text]);

  return (
    <>
      <span className="sr-only">{text}</span>
      {/* initial children = final text → never blank (SSR, no-JS, backgrounded tab); the effect
          overwrites with the scramble→resolve animation when motion is allowed */}
      <span ref={ref} className="matrix-glyphs" aria-hidden>
        {text}
      </span>
    </>
  );
}
