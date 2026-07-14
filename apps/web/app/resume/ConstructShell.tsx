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
        setVeil(true); // green rain-wipe covers the static→stations snap
        timers.push(window.setTimeout(() => setMode("immersive"), 200)); // wipe fully covers by ~140ms
        timers.push(window.setTimeout(() => setVeil(false), 760)); // let the 700ms wipe fully fade out
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

  // Oracle → Construct deep-link: /resume?station=<key> brings the matching station to view. Immersive
  // positions station i at `i*vh` (the camera model Immersive's own focusin scroll uses), so we scroll by
  // index there — the cards are visibility-hidden pre-paint, so focus() wouldn't land. Static/reduced-motion
  // focuses + scrolls the card directly (the a11y path — reduced-motion users never get immersive). Re-runs
  // on the static→immersive flip; never throws on an unknown station.
  useEffect(() => {
    const station = new URLSearchParams(window.location.search).get("station");
    if (!station) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(
      () => {
        const el = document.getElementById(`cst-${station}`); // getElementById → null on miss, never throws
        if (!el) return;
        const target = el.matches("[data-station]") ? el : el.querySelector<HTMLElement>("[data-station]");
        if (!(target instanceof HTMLElement)) return;
        if (mode === "immersive") {
          // scope to the construct root — the SAME set/order Immersive positions (index must match)
          const scope = rootRef.current ?? document;
          const cards = Array.from(scope.querySelectorAll<HTMLElement>("[data-station]"));
          const idx = cards.indexOf(target);
          // instant scroll (like Immersive's own focusin nav) — the camera lerp animates the descent;
          // "smooth" fights the rAF loop and gets cancelled
          if (idx >= 0) window.scrollTo({ top: idx * window.innerHeight });
        } else {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        }
      },
      mode === "immersive" ? 500 : 60,
    );
    return () => window.clearTimeout(t);
  }, [mode]);

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
