"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../../data/projects";
import { tiltHandlers } from "./motion";

/* Project cards + tag filter + shareable curated decks. Server-renders the full list
   (DOM-first for SEO); the tag filter, the ?deck= URL narrowing (read post-hydration,
   NOT useSearchParams — keeps /work statically generated), and the per-card blurb
   disclosure are all client-only. */
const tilt = tiltHandlers();
function WorkCard({ p }: { p: Project }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(p.detail || p.stack?.length || p.highlights?.length);
  const detailId = `detail-${p.slug}`;
  return (
    <article
      className={`card${p.featured ? " featured" : ""}`}
      style={{ "--card-accent": `var(--${p.accent ?? "violet"})` } as React.CSSProperties}
      {...tilt}
    >
      {p.featured && <span className="card-live">you&apos;re looking at it</span>}
      <h2 className="card-name">{p.name}</h2>
      <p className="card-year">{p.year}</p>
      <p className="card-blurb">{p.blurb}</p>
      {hasDetail && (
        <button
          type="button"
          className="card-more"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "less ▴" : "details ▾"}
        </button>
      )}
      {/* always rendered so aria-controls resolves; hidden={!open} => display:none removes it from
          the a11y tree + tab order (no CSS-only collapse, AT-correct, reduced-motion-safe) */}
      {hasDetail && (
        <div id={detailId} className="card-detail" hidden={!open}>
          {p.detail && <p className="card-detail-text">{p.detail}</p>}
          {p.stack && p.stack.length > 0 && (
            <p className="card-stack" aria-label="tech stack">
              {p.stack.map((s) => (
                <span key={s} className="card-chip">
                  {s}
                </span>
              ))}
            </p>
          )}
          {p.highlights && p.highlights.length > 0 && (
            <ul className="card-highlights">
              {p.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}
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
      <p className="card-oracle">
        <a href={`/oracle?ctx=project:${p.slug}`} aria-label={`ask the oracle about ${p.name}`}>
          ask the oracle ▸
        </a>
      </p>
    </article>
  );
}

export function WorkGrid({ projects }: { projects: Project[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [deck, setDeck] = useState<string[] | null>(null); // null → full default list
  const [share, setShare] = useState<string | null>(null); // "copied" | a url | null
  const shareTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(shareTimer.current), []);

  const bySlug = useMemo(() => new Map(projects.map((p) => [p.slug, p])), [projects]);

  // read ?deck post-hydration (SSR renders the full list; this only narrows client-side)
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("deck");
    if (!raw) return;
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of raw.split(",")) {
      const slug = s.trim();
      if (slug && bySlug.has(slug) && !seen.has(slug)) {
        seen.add(slug);
        list.push(slug);
      }
    }
    if (list.length) setDeck(list);
  }, [bySlug]);

  const tags = useMemo(() => {
    const seen: string[] = [];
    for (const p of projects) for (const t of p.tags) if (!seen.includes(t)) seen.push(t);
    return seen;
  }, [projects]);

  const base = deck ? deck.map((s) => bySlug.get(s)).filter((p): p is Project => !!p) : projects;
  const shown = active ? base.filter((p) => p.tags.includes(active)) : base;

  async function copyDeck() {
    const url = `${window.location.origin}/work?deck=${shown.map((p) => p.slug).join(",")}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShare("copied");
        window.clearTimeout(shareTimer.current); // reset the ack window on rapid re-clicks
        shareTimer.current = window.setTimeout(() => setShare(null), 2000);
        return;
      }
    } catch {
      /* fall through to a manual-copy input */
    }
    setShare(url);
  }

  return (
    <>
      <div className="tag-filter" role="group" aria-label="Filter projects by technology">
        <button type="button" className="tag-pill" aria-pressed={active === null} onClick={() => setActive(null)}>
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

      <div className="work-bar">
        <p className="work-count" aria-live="polite">
          {shown.length} artifact{shown.length === 1 ? "" : "s"}
          {deck ? " · deck" : ""}
          {active ? ` · ${active}` : ""}
        </p>
        <button type="button" className="work-share" onClick={copyDeck}>
          copy deck link
        </button>
      </div>
      {share === "copied" && (
        <p className="work-share-ack" role="status">
          copied ✓ — a link to this deck is on your clipboard
        </p>
      )}
      {share && share !== "copied" && (
        <input
          className="work-share-url"
          readOnly
          value={share}
          aria-label="Deck link — select to copy"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}

      {shown.length ? (
        <div className="cards">
          {shown.map((p) => (
            <WorkCard key={p.slug} p={p} />
          ))}
        </div>
      ) : (
        // reachable via a deck + tag combo that matches nothing — clearing the tag keeps the deck
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
