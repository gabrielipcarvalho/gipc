"use client";

import { useMemo, useState } from "react";
import type { Project } from "../../data/projects";
import { tiltHandlers } from "./motion";

/* Project cards + tag filter. Server-renders the full list (DOM-first for SEO);
   filtering is a client-only conditional render — hidden cards leave the DOM. */
const tilt = tiltHandlers();

export function WorkGrid({ projects }: { projects: Project[] }) {
  const [active, setActive] = useState<string | null>(null);

  const tags = useMemo(() => {
    const seen: string[] = [];
    for (const p of projects) for (const t of p.tags) if (!seen.includes(t)) seen.push(t);
    return seen;
  }, [projects]);

  const shown = active ? projects.filter((p) => p.tags.includes(active)) : projects;

  return (
    <>
      <div className="tag-filter" role="group" aria-label="Filter projects by technology">
        <button
          type="button"
          className="tag-pill"
          aria-pressed={active === null}
          onClick={() => setActive(null)}
        >
          all
        </button>
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className="tag-pill"
            aria-pressed={active === t}
            onClick={() => setActive((a) => (a === t ? null : t))}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="work-count" aria-live="polite">
        {shown.length} artifact{shown.length === 1 ? "" : "s"}
        {active ? ` · ${active}` : ""}
      </p>

      {shown.length ? (
        <div className="cards">
          {shown.map((p) => (
            <article key={p.slug} className={`card${p.featured ? " featured" : ""}`} {...tilt}>
              {p.featured && <span className="card-live">you&apos;re looking at it</span>}
              <h2 className="card-name">{p.name}</h2>
              <p className="card-year">{p.year}</p>
              <p className="card-blurb">{p.blurb}</p>
              <p className="card-tags">
                {p.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </p>
              {p.links && p.links.length > 0 && (
                <p className="card-links">
                  {p.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${p.name} — ${l.label} (opens in new tab)`}
                    >
                      {l.label} ↗
                    </a>
                  ))}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        // defensive only — unreachable under single-select (every pill maps to ≥1 project)
        <p className="work-empty">
          nothing matches —{" "}
          <button type="button" className="tag-pill" onClick={() => setActive(null)}>
            clear filter
          </button>
        </p>
      )}
    </>
  );
}
