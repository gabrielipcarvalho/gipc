"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* The Construct's mode switch. Server/static first: children (the full résumé DOM)
   render stacked; if motion is allowed, the immersive layer lazy-loads and the SAME
   nodes become depth stations behind the glyph rain. ESC / "wake up" exits to the
   Console (world-shift back to arcane). */
const Immersive = dynamic(() => import("./Immersive").then((m) => m.Immersive), {
  ssr: false,
});

/* Construct window-keydown handlers must yield to the command palette: it
   preventDefaults keys it consumes (events still bubble to window), and while it's
   open the app shell is inert. */
export function constructKeyBlocked(e: KeyboardEvent): boolean {
  return e.defaultPrevented || document.getElementById("app-shell")?.hasAttribute("inert") === true;
}

export function ConstructShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<"static" | "immersive">("static");
  const [veil, setVeil] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // jack in: post-hydration only, never under reduced motion. The mode flips ONLY
  // after the immersive chunk has actually loaded — on a slow or failed fetch the
  // page simply stays static (the motion layer is optional, never load-bearing).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    const timers: number[] = [];
    import("./Immersive")
      .then(() => {
        if (cancelled) return;
        setVeil(true); // green veil covers the static→stations snap
        timers.push(window.setTimeout(() => setMode("immersive"), 200)); // veil fully opaque ≥163ms
        timers.push(window.setTimeout(() => setVeil(false), 700));
      })
      .catch(() => {
        /* chunk failed to load — remain in static mode */
      });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  // ESC → wake up (exit to the console)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || constructKeyBlocked(e)) return;
      router.push("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div ref={rootRef} className="construct" data-mode={mode}>
      {mode === "immersive" && <Immersive rootRef={rootRef} />}
      {veil && <div className="cst-veil" aria-hidden />}
      <Link className="cst-wake" href="/">
        ⏏ wake up <span className="cst-wake-kbd">esc</span>
      </Link>
      {children}
    </div>
  );
}
