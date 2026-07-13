"use client";

import type { TimelineNode } from "../../data/timeline";
import { tiltHandlers } from "./motion";

/* Vertical career timeline — a glowing rail with a node per role/degree. Client only
   for pointer tilt; server-renders the full list (DOM-first for SEO). Reduced-motion
   stills the rail/dot/tilt via the global rule + the tiltHandlers JS guard. */
const tilt = tiltHandlers();

export function Timeline({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <ol className="tl">
      {nodes.map((n, i) => (
        <li className="tl-node" key={`${n.kind}-${i}`} {...tilt}>
          <span className="tl-dot" aria-hidden />
          <p className="tl-period">{n.period}</p>
          <h2 className="tl-title">{n.title}</h2>
          <p className="tl-org">
            {n.org}
            {n.location ? ` · ${n.location}` : ""}
          </p>
          {n.note && <p className="tl-note">{n.note}</p>}
          {n.bullets && n.bullets.length > 0 && (
            <ul className="tl-bullets">
              {n.bullets.map((b) => (
                <li key={b.slice(0, 40)}>{b}</li>
              ))}
            </ul>
          )}
          {n.detail && <p className="tl-detail">{n.detail}</p>}
          {n.tags && n.tags.length > 0 && (
            <p className="tl-tags">
              {n.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
