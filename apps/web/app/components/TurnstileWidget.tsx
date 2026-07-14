"use client";

import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY } from "../../data/turnstile";

/* Cloudflare Turnstile — script + explicit render (no react wrapper dep). Client-only (SSRs nothing).
   Only mounted when a REAL site key is configured (see TURNSTILE_ON); with the test key it's off entirely.
   Token is single-use — the parent calls resetRef after each send. Graceful: script blocked (adblock) →
   onError → the chat shows an honest note. */

const SITE_KEY = TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script blocked"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function TurnstileWidget({
  onToken,
  onError,
  resetRef,
}: {
  onToken: (token: string) => void;
  onError: () => void;
  resetRef: React.MutableRefObject<(() => void) | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (t: string) => onToken(t),
          "error-callback": () => onError(),
          "expired-callback": () => onToken(""),
        });
        resetRef.current = () => {
          if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
        };
      })
      .catch(() => {
        if (!cancelled) onError();
      });
    return () => {
      cancelled = true;
      resetRef.current = null;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={boxRef} className="turnstile-box" role="group" aria-label="bot verification" />;
}
