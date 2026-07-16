"use client";

import { useState } from "react";
import type { ArchDiagramData, ArchEdge, ArchNode } from "../../data/architecture";

/* Living architecture diagram — hand-rolled SVG, house a11y pattern: the SVG is aria-hidden
   decorative (pointer events still work on it); the semantics live in an HTML button strip below
   (one button per node, aria-pressed = pinned). Hover previews, click pins (effective =
   selected ?? hovered); Escape clears the pin without moving focus. Edge facts render on BOTH
   endpoint cards (→ outgoing / ← incoming). The <details> text fallback carries the full content
   for crawlers + noscript. Deterministic render from serializable props — SSR-safe. */

type Pt = [number, number];

// boundaryPoint: where the segment p→center crosses `n`'s (slightly inflated) boundary — so edges
// start/end at node borders, not centers, and the arrowheads stay visible instead of being
// painted over by the opaque node rects (QA M-1).
function boundaryPoint(p: Pt, n: ArchNode): Pt {
  const c: Pt = [n.x + n.w / 2, n.y + n.h / 2];
  const dx = c[0] - p[0];
  const dy = c[1] - p[1];
  const pad = 3;
  const x0 = n.x - pad, y0 = n.y - pad, x1 = n.x + n.w + pad, y1 = n.y + n.h + pad;
  let t = 1;
  if (dx !== 0) {
    const tx = (dx > 0 ? x0 - p[0] : x1 - p[0]) / dx;
    if (tx > 0 && tx < 1) {
      const y = p[1] + tx * dy;
      if (y >= y0 && y <= y1) t = Math.min(t, tx);
    }
  }
  if (dy !== 0) {
    const ty = (dy > 0 ? y0 - p[1] : y1 - p[1]) / dy;
    if (ty > 0 && ty < 1) {
      const x = p[0] + ty * dx;
      if (x >= x0 && x <= x1) t = Math.min(t, ty);
    }
  }
  return [p[0] + t * dx, p[1] + t * dy];
}

function edgePath(d: ArchDiagramData, e: ArchEdge): string {
  const from = d.nodes.find((n) => n.id === e.from);
  const to = d.nodes.find((n) => n.id === e.to);
  if (!from || !to) throw new Error(`arch edge ${e.id}: unknown endpoint`); // fails next build loudly
  const fromC: Pt = [from.x + from.w / 2, from.y + from.h / 2];
  const toC: Pt = [to.x + to.w / 2, to.y + to.h / 2];
  const via = e.via ?? [];
  const start = boundaryPoint(via[0] ?? toC, from); // leave the source at its border
  const end = boundaryPoint(via[via.length - 1] ?? fromC, to); // arrive at the target's border
  const pts = [start, ...via, end];
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

export function ArchDiagram({ data }: { data: ArchDiagramData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = selected ?? hovered;

  const activeNode: ArchNode | undefined = data.nodes.find((n) => n.id === active);
  const touching = (e: ArchEdge) => e.from === active || e.to === active;

  function pick(id: string) {
    setSelected((cur) => (cur === id ? null : id));
  }

  return (
    <section
      className="arch"
      aria-label={data.title}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") setSelected(null); // focus stays put — nothing leaves the DOM
      }}
    >
      <h3 className="arch-h">{data.title}</h3>
      <p className="arch-caption">{data.caption}</p>

      {/* Visual layer — decorative; buttons below carry the semantics. */}
      <div
        className="arch-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${data.title} diagram (visual — controls below)`}
      >
        <svg
          className="arch-svg"
          viewBox={`0 0 ${data.viewW} ${data.viewH}`}
          style={{ minWidth: `${data.viewW - 40}px` }}
          aria-hidden
        >
          <defs>
            <marker
              id={`${data.id}-arrow`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L8 4 L0 8 z" className="arch-arrowhead" />
            </marker>
          </defs>
          {data.lanes.map((l) => (
            <g key={l.label}>
              <rect className="arch-lane" x={l.x} y={l.y} width={l.w} height={l.h} rx={6} />
              <text className="arch-lanelabel" x={l.x + 10} y={l.y + 16}>
                {l.label}
              </text>
            </g>
          ))}
          {data.edges.map((e) => (
            <path
              key={e.id}
              className={`arch-edge ${active ? (touching(e) ? "hot" : "cold") : ""}`}
              d={edgePath(data, e)}
              markerEnd={`url(#${data.id}-arrow)`}
            />
          ))}
          {data.nodes.map((n) => (
            <g
              key={n.id}
              className={`arch-node ${active === n.id ? "hot" : active ? "cold" : ""}`}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered((cur) => (cur === n.id ? null : cur))}
              onClick={() => pick(n.id)}
            >
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={7} />
              <text className="arch-label" x={n.x + n.w / 2} y={n.y + (n.sub ? 19 : 27)} textAnchor="middle">
                {n.label}
              </text>
              {n.sub && (
                <text className="arch-sub" x={n.x + n.w / 2} y={n.y + 35} textAnchor="middle">
                  {n.sub}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Semantic layer — one button per node. */}
      <div className="arch-picker" role="group" aria-label={`${data.title} components`}>
        {data.nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`dbx-pick ${selected === n.id ? "on" : ""}`}
            aria-pressed={selected === n.id}
            onClick={() => pick(n.id)}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered((cur) => (cur === n.id ? null : cur))}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="arch-card">
        {activeNode ? (
          <>
            <p className="arch-card-title">
              {activeNode.label}
              {activeNode.sub ? <span className="arch-card-sub"> — {activeNode.sub}</span> : null}
            </p>
            <ul className="arch-facts">
              {activeNode.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
              {data.edges
                .filter((e) => e.from === activeNode.id)
                .map((e) => (
                  <li key={e.id} className="arch-edgefact">
                    → {data.nodes.find((n) => n.id === e.to)?.label} · {e.fact}
                  </li>
                ))}
              {data.edges
                .filter((e) => e.to === activeNode.id)
                .map((e) => (
                  <li key={e.id} className="arch-edgefact">
                    ← {data.nodes.find((n) => n.id === e.from)?.label} · {e.fact}
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p className="arch-card-title arch-card-empty">
            select a component — hover previews, click pins, Escape clears
          </p>
        )}
      </div>

      {/* Crawlable / noscript text fallback — the full content, always in the DOM. */}
      <details className="arch-text">
        <summary>full text: nodes, edges and facts — {data.title}</summary>
        <ul>
          {data.nodes.map((n) => (
            <li key={n.id}>
              <strong>{n.label}</strong>
              {n.sub ? ` (${n.sub})` : ""}
              <ul>
                {n.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </li>
          ))}
          {data.edges.map((e) => (
            <li key={e.id}>
              {data.nodes.find((n) => n.id === e.from)?.label} →{" "}
              {data.nodes.find((n) => n.id === e.to)?.label}: {e.fact}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
