"""Oracle visitor-context resolver — THE anti-injection boundary for ?ctx=.

The client sends a typed slug (`project:x` | `station:x` | `page:x` | `writeup:x`); the PHRASE that
enters the prompt is built HERE from server-side data only. The raw client string never reaches the
prompt (not even escaped) — malformed, unknown, over-long, or legacy free-text values resolve to
None and are silently ignored. Never raises; never logs the raw value.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

_SLUG_RE = re.compile(r"[a-z0-9-]{1,64}")  # used with fullmatch — no $-newline hole

PAGES: dict[str, str] = {
    "work": "the /work project deck",
    "writeups": "the engineering writeups",
    "resume": "the résumé (the Construct)",
    "timeline": "the experience timeline",
    "system": "the live system dashboard",
    "lab": "the Lab — live safe-by-construction infra demos",
    "infra": "the infrastructure overview",
    "status": "the public status page",
    "connect": "the contact page",
    "meet": "the book-a-call page",
}

# The 7 Construct station keys — mirrors StaticResume's cst-* ids (drift-pinned by tests).
STATIONS: dict[str, str] = {
    "profile": "the résumé profile station",
    "skills": "the résumé skills station",
    "experience": "the résumé experience station",
    "projects": "the résumé projects station",
    "publications": "the résumé publications station",
    "education": "the résumé education station",
    "honours": "the résumé honours station",
}

# Static mirror of apps/web/data/writeups.ts (3 posts; drift-pinned by tests — a new writeup fails
# the pin at edit time; an unknown slug degrades to None, fail-safe).
WRITEUPS: dict[str, str] = {
    "building-the-lab": "Building the Lab: safe-by-construction infra demos",
    "self-hosting-on-k3s": "Self-hosting a portfolio on bare-metal k3s",
    "the-construct-resume": "The Construct: a Matrix résumé",
}


@lru_cache(maxsize=2)
def _projects(corpus_dir: Path) -> dict[str, str]:
    """slug → 'Name (year): blurb' from the BAKED corpus/projects.json. Cached per corpus_dir (an
    env-derived constant → effectively one entry). Missing/corrupt file → {} — the image is
    immutable, so caching the empty result is safe (boot independence: never raises)."""
    try:
        raw = json.loads((corpus_dir / "projects.json").read_text())
        out: dict[str, str] = {}
        for p in raw:
            slug = p.get("slug")
            if isinstance(slug, str) and _SLUG_RE.fullmatch(slug):
                name = p.get("name", slug)
                year = p.get("year", "")
                blurb = p.get("blurb", "")
                out[slug] = f"{name}{f' ({year})' if year else ''}: {blurb}".strip().rstrip(":")
        return out
    except Exception:  # noqa: BLE001 — any corpus failure degrades to no project contexts
        return {}


def resolve_context(raw: str | None, corpus_dir: Path) -> str | None:
    """Typed slug → a neutral server-built phrase, else None. The returned string is composed ONLY
    of server-side data — the raw input contributes nothing but the lookup key."""
    if not raw or len(raw) > 96 or ":" not in raw:
        return None
    kind, _, key = raw.partition(":")
    if not _SLUG_RE.fullmatch(key):
        return None
    title: str | None = None
    if kind == "project":
        title = _projects(corpus_dir).get(key)
    elif kind == "station":
        title = STATIONS.get(key)
    elif kind == "page":
        title = PAGES.get(key)
    elif kind == "writeup":
        w = WRITEUPS.get(key)
        title = f'the writeup "{w}"' if w else None
    if not title:
        return None
    return f"The visitor is currently looking at {title}."
