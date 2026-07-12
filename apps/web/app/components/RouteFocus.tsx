"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ROUTES } from "./routes";

/* Focus + announce on client-side route change (App Router doesn't move focus on
   navigation). On every pathname CHANGE (not the initial mount) it focuses the page's
   <main> landmark and announces the route via a polite live region — so keyboard and
   screen-reader users land at the new page's content instead of a stale spot. */
function labelFor(pathname: string): string {
  if (pathname === "/") return "home";
  const hit = ROUTES.find((r) => r.href === pathname);
  return hit ? hit.label : pathname.replace(/^\//, "");
}

export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  const liveRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // RouteFocus runs LAST on a navigation commit (it's a later sibling than #app-shell),
    // so whatever it focuses wins. If the palette's "open console" flagged this nav, focus
    // the console input directly; otherwise focus the new page's <main> landmark.
    let target: HTMLElement | null = null;
    let focusConsole = false;
    try {
      focusConsole = sessionStorage.getItem("gipc-focus-console") !== null;
    } catch {
      /* storage may be unavailable */
    }
    if (focusConsole) {
      try {
        sessionStorage.removeItem("gipc-focus-console");
      } catch {
        /* storage may be unavailable */
      }
      target = document.getElementById("console-input");
    }
    if (!target) target = document.querySelector("main");
    if (target instanceof HTMLElement) target.focus();
    if (liveRef.current) liveRef.current.textContent = `${labelFor(pathname)} — ready`;
  }, [pathname]);

  return <span ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />;
}
