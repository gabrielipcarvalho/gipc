import type { ReactNode } from "react";
import { Sigil } from "../sigil";

/* Shared terminal chrome — the `.term` window (titlebar traffic-dots + hex-sigil +
   path + live-meta strip, glass body) extracted from the Console so every route
   reuses it. Server component (no interactivity). The titlebar mirrors console.tsx
   exactly; `path` is prefixed with the `arcane@prod : ` user@host so pages match. */
export function TerminalWindow({
  path,
  meta,
  children,
}: {
  path: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="term revealed" aria-label={`${path} terminal`}>
      <header className="term-bar">
        <div className="dots" aria-hidden>
          <span className="dot r" />
          <span className="dot y" />
          <span className="dot g" />
        </div>
        <Sigil className="sigil" />
        <span className="bar-path">arcane@prod : {path}</span>
        <div className="bar-meta">
          {meta ?? (
            <>
              <span className="pulse" aria-hidden /> online
              <span className="sep">·</span> p99 12ms
              <span className="sep rps">·</span> <span className="rps">142 rps</span>
            </>
          )}
        </div>
      </header>
      <div className="term-body">{children}</div>
    </section>
  );
}
