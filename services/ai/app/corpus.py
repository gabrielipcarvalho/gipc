"""Corpus loaders + chunkers — THE privacy boundary.

Everything here is an explicit allow-list of already-public content. basics is field-allow-listed
(BASICS_PUBLIC_FIELDS): `phone` and `private` are never rendered on the site and NEVER enter the corpus.
Internal `evidence` ids and the file's `meta` are likewise excluded. The private career-evidence
directory, keys, or any private source must never appear as a loader path (tested).
"""

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

# The EXACT set StaticResume renders publicly — nothing else from basics may be chunked.
BASICS_PUBLIC_FIELDS = frozenset(
    {"name", "label", "location", "email", "site", "profiles", "workRights", "summary"}
)


@dataclass(frozen=True)
class Chunk:
    source: str  # resume | projects | site
    title: str
    url: str  # public site anchor for the citation
    content: str

    @property
    def content_hash(self) -> str:
        h = hashlib.sha256()
        h.update(f"{self.source}\x00{self.title}\x00{self.url}\x00{self.content}".encode())
        return h.hexdigest()


def load_corpus(corpus_dir: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    chunks += resume_chunks(json.loads((corpus_dir / "resume.json").read_text()))
    chunks += project_chunks(json.loads((corpus_dir / "projects.json").read_text()))
    chunks += site_chunks((corpus_dir / "site.md").read_text())
    return [c for c in chunks if c.content.strip()]


# ---- résumé -----------------------------------------------------------------


def resume_chunks(resume: dict) -> list[Chunk]:
    out: list[Chunk] = []
    b = {k: v for k, v in resume["basics"].items() if k in BASICS_PUBLIC_FIELDS}
    loc = b.get("location", {})
    identity = (
        f"{b.get('name', '')} — {b.get('label', '')}. "
        f"Based in {loc.get('city', '')}, {loc.get('region', '')}, {loc.get('country', '')}"
        f"{'; relocation: ' + loc['relocation'] if loc.get('relocation') else ''}. "
        f"{b.get('workRights', '')} "
        f"Contact: {b.get('email', '')} · {b.get('site', '')} · "
        + " · ".join(p.get("url", "") for p in b.get("profiles", []))
        + f"\n\n{b.get('summary', '')}"
    )
    out.append(Chunk("resume", "Gabriel Carvalho — profile", "/resume", identity))

    for g in resume.get("skills", []):
        out.append(
            Chunk(
                "resume",
                f"Skills — {g['category']}",
                "/resume",
                f"{g['category']}: " + ", ".join(g["items"]),
            )
        )

    for r in resume.get("experience", []):
        body = f"{r['role']} at {r['org']} ({r.get('location', '')}), {r['start']} – {r['end']}."
        if r.get("note"):
            body += f" {r['note']}"
        body += "\n" + "\n".join(f"- {x}" for x in r.get("bullets", []))
        out.append(Chunk("resume", f"Experience — {r['role']} · {r['org']}", "/timeline", body))

    for p in resume.get("projects", []):
        out.append(
            Chunk(
                "resume",
                f"Project — {p['name']}",
                p.get("url") or "/work",
                f"{p['name']} ({p.get('year', '')}): {p.get('text', '')} "
                f"Keywords: {', '.join(p.get('keywords', []))}",
            )
        )

    for pub in resume.get("publications", []):
        out.append(
            Chunk(
                "resume",
                f"Publication — {pub['title'][:60]}",
                "/resume",
                f"{pub['title']} — {pub['venue']}"
                f"{', vol. ' + str(pub['volume']) if pub.get('volume') else ''}"
                f"{', pp. ' + pub['pages'] if pub.get('pages') else ''} ({pub.get('date', '')}). "
                f"DOI: {pub.get('doi', '')}. Author position: {pub.get('authorPosition', '')}.",
            )
        )

    edu = "\n".join(
        f"- {e['degree']}, {e['org']} ({e.get('start', '')}–{e.get('end', '')}). {e.get('detail', '')}"
        for e in resume.get("education", [])
    )
    out.append(Chunk("resume", "Education", "/resume", edu))

    extras = []
    for c in resume.get("certifications", []):
        extras.append(f"- Certification: {c['name']} ({c.get('date', '')})")
    for a in resume.get("awards", []):
        extras.append(f"- Award: {a['name']} ({a.get('date', '')})")
    for le in resume.get("leadership", []):
        extras.append(f"- {le['name']}: {le.get('text', '')}")
    out.append(Chunk("resume", "Certifications, awards & leadership", "/resume", "\n".join(extras)))
    return out


# ---- projects.json (the /work deck) ----------------------------------------


def project_chunks(projects: list[dict]) -> list[Chunk]:
    return [
        Chunk(
            "projects",
            f"Work — {p['name']}",
            f"/work#{p.get('slug', '')}",
            f"{p['name']} ({p.get('year', '')}): {p.get('blurb', '')} Tags: {', '.join(p.get('tags', []))}",
        )
        for p in projects
    ]


# ---- site.md explainers ------------------------------------------------------


def site_chunks(md: str) -> list[Chunk]:
    out: list[Chunk] = []
    for block in re.split(r"\n(?=# )", md.strip()):
        lines = block.strip().splitlines()
        if not lines:
            continue
        title = lines[0].lstrip("# ").strip()
        url = "/"
        body_lines = []
        for ln in lines[1:]:
            if ln.startswith("url:"):
                url = ln.split(":", 1)[1].strip()
            else:
                body_lines.append(ln)
        out.append(Chunk("site", title, url, "\n".join(body_lines).strip()))
    return out
