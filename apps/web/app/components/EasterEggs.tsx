"use client";

import { useEffect, useState } from "react";

/* Global flair — mounted as a layout sibling (outside #app-shell). The Konami listener is a
   PURE observer (never preventDefault) so it can't disturb console history-arrows, ⌘K, or the
   Construct's arrows. Vim j/k/g/G scroll only when not typing and no ctrl/alt/meta held (Shift
   is allowed — G is Shift+g); they preventDefault only their own action, never arrows/Escape. */
const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function EasterEggs() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let idx = 0;
    let toastTimer: number | undefined;
    const flash = (msg: string) => {
      setToast(msg);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 2600);
    };

    const onKey = (e: KeyboardEvent) => {
      // --- Konami (observer only) ---
      const key = e.key.toLowerCase();
      idx = key === KONAMI[idx] ? idx + 1 : key === KONAMI[0] ? 1 : 0;
      if (idx === KONAMI.length) {
        idx = 0;
        try {
          localStorage.setItem("gipc-last-login", new Date().toISOString());
        } catch {
          /* private mode */
        }
        flash("◆ login stamp updated");
      }

      // --- vim nav ---
      if (e.ctrlKey || e.altKey || e.metaKey) return; // Shift intentionally NOT guarded (G)
      if (isEditable(document.activeElement)) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
      if (e.key === "j") {
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.4, behavior });
      } else if (e.key === "k") {
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.4, behavior });
      } else if (e.key === "g") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior });
      } else if (e.key === "G") {
        e.preventDefault();
        window.scrollTo({ top: document.body.scrollHeight, behavior });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(toastTimer);
    };
  }, []);

  return toast ? (
    <div className="egg-toast" role="status">
      {toast}
    </div>
  ) : null;
}
