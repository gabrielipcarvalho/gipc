"use client";

import { useEffect } from "react";
import { TerminalWindow } from "./components/TerminalWindow";

/* Route-error boundary (app root) — catches every page/segment error below the
   layout. The layout shell (nav, palette) stays alive; reset() re-renders the
   failed segment. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[gipc] route error", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/fault">
        <p className="line">
          <span className="prompt">arcane@prod:~$</span> segfault in the weave
        </p>
        <h1 className="nf-title">something misfired — the sigil held</h1>
        <p className="page-lead">
          The rest of the console is untouched. Recast the page, or head home.
        </p>
        <p className="nf-actions">
          <button className="btn btn-primary" type="button" onClick={reset}>
            ▸ recast
          </button>
          <a className="btn btn-ghost" href="/">
            back to the console
          </a>
        </p>
      </TerminalWindow>
    </main>
  );
}
