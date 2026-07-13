"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

/* Animates the numbers inside a string 0→target when `active` becomes truthy (at mount OR on
   a false→true transition), preserving units/spacing. Renders the final text whenever inactive
   — so the ONLY SSR consumer (the Console) is hydration-identical (mounts active=false=final).
   Steady-state text changes while active (e.g. /system's 5s poll) SNAP to the new value (no
   re-animate) so live telemetry never goes stale. Reduced-motion → final instantly. */
const DUR = 700;
const NUM = /(\d+(?:\.\d+)?)/;

type Token = { text: string; value: number | null; decimals: number };

function tokenize(s: string): Token[] {
  return s.split(NUM).map((part) =>
    NUM.test(part) && part.length
      ? { text: part, value: parseFloat(part), decimals: (part.split(".")[1] ?? "").length }
      : { text: part, value: null, decimals: 0 },
  );
}

export function CountUpText({ text, active }: { text: string; active: boolean }) {
  const tokens = tokenize(text);
  const [display, setDisplay] = useState(text); // final text on SSR + first render
  const raf = useRef<number | undefined>(undefined);
  const wasActive = useRef(false);

  useEffect(() => {
    const startAnim = active && !wasActive.current; // mount-active or false→true
    wasActive.current = active;
    if (!active) {
      setDisplay(text);
      return;
    }
    if (!startAnim || prefersReducedMotion()) {
      setDisplay(text); // steady-state text change (poll) → snap; or reduced-motion → final
      return;
    }
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / DUR);
      setDisplay(
        tokens
          .map((t) => (t.value === null ? t.text : (t.value * p).toFixed(t.decimals)))
          .join(""),
      );
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active]);

  // reserve the FINAL width (hidden) so a growing digit count never reflows neighbours
  return (
    <span className="countup">
      <span className="countup-live">{display}</span>
      <span className="countup-reserve" aria-hidden>
        {text}
      </span>
    </span>
  );
}
