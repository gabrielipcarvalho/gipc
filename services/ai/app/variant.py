"""JD-tailored résumé variant — a DETERMINISTIC select + reorder over the sanitized résumé facts.

ZERO-FABRICATION BY CONSTRUCTION. There is NO LLM call. The output is a permutation of the EXISTING
résumé strings: `build_facts` is the fabrication boundary — it runs on `sanitize_resume()` output (so no
internal evidence id or private field can surface) and every emitted `TailoredFact.text` is copied
verbatim from a built `Fact`. Nothing here writes free text, so nothing can be invented.

Ranking is curated-keyword + text-token overlap against the JD (the résumé's bullets/projects carry
curated `keywords[]`; skill groups derive tokens from their `items`). `gaps` are JD skill-terms the
résumé does not evidence — JD-derived, honest, and bounded to a recognized-skill vocabulary so the list
is not a raw JD-word dump. No Anthropic call ⇒ no budget to meter; the route stays up even when the
oracle is unconfigured or over-budget.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from pydantic import BaseModel, Field

from .resume_evidence import sanitize_resume


# --- internal fact model (never serialized as-is) ---------------------------
@dataclass(frozen=True)
class Fact:
    id: str  # "exp:{i}:{j}" | "proj:{i}" | "skill:{i}"
    kind: str  # "bullet" | "project" | "skill"
    text: str  # VERBATIM résumé string (skills: a join of real `items` — composition of real fields)
    section: str  # org · role | project name | skill category
    keywords: tuple[str, ...]


# --- output models ----------------------------------------------------------
class TailoredFact(BaseModel):
    id: str
    kind: str
    text: str
    section: str
    score: int
    matched: list[str] = Field(default_factory=list)


class TailoredResume(BaseModel):
    ordered: list[TailoredFact]
    gaps: list[str] = Field(default_factory=list)
    jdKeywords: list[str] = Field(default_factory=list)
    factCount: int


# --- tokenization -----------------------------------------------------------
# keep intra-token separators so "ci/cd", "node.js", "c#", "next.js" survive as one token
_WORD = re.compile(r"[a-z0-9]+(?:[+.#/][a-z0-9]+)*")

_STOP_WORDS = (
    "the and for with are you our your will this that from have has who all any but not can out use "
    "using used work working works team role their they them then than also into over per via etc "
    "strong excellent proven ability able years year experience experienced skills skill knowledge "
    "understanding across within must should would could been being about which while where when what"
)
_STOP = frozenset(_STOP_WORDS.split())

# Recognized-skill vocabulary — a static FILTER for gap salience (which JD terms count as "a skill the
# résumé lacks"). It is NOT résumé content and never sources an output string; gaps come from the JD
# (jd ∩ VOCAB) minus what the résumé evidences. Includes skills the résumé HAS (so they are correctly
# excluded from gaps) and common ones it lacks (so honest gaps surface).
# Canonical spellings only (variants like nodejs/k8s/postgres are folded in by _CANON before they reach
# this set; pure 2-letter forms are dropped by the len>=3 token floor, so none are listed here).
_SKILL_WORDS = (
    "python javascript typescript go rust java kotlin scala ruby php swift cpp "
    "react next.js node.js vue svelte angular django flask fastapi rails spring express "
    "kubernetes k3s docker terraform ansible helm argocd nginx caddy linux bash git ci/cd "
    "aws gcp azure cloudflare vercel supabase postgresql mysql sqlite redis mongodb kafka "
    "rabbitmq graphql rest grpc sql pytorch tensorflow keras onnx numpy pandas sklearn transformers "
    "llm nlp rag embeddings pgvector opencv pytest vitest playwright cypress jest prometheus grafana "
    "hadoop spark airflow snowflake databricks elasticsearch selenium figma"
)
SKILL_VOCAB = frozenset(_SKILL_WORDS.split())

# Canonicalize common JD spelling variants to the RÉSUMÉ's spelling, so "postgres"/"nodejs"/"k8s"/"cicd"
# match the résumé's "postgresql"/"node.js"/"kubernetes"/"ci/cd" instead of surfacing as FALSE gaps
# (QA-CODE-P3 MEDIUM — spec "honest gaps"). Applied to BOTH the JD and résumé sides. Targets are the
# real résumé tokens. (k3s is deliberately NOT folded into kubernetes — the résumé lists both, distinct.)
_CANON = {
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "postgre": "postgresql",
    "node": "node.js",
    "nodejs": "node.js",
    "cicd": "ci/cd",
    "nextjs": "next.js",
    "reactjs": "react",
    "golang": "go",
}


def _tokens(text: str) -> set[str]:
    return {
        _CANON.get(t, t) for t in _WORD.findall(text.lower()) if len(t) >= 3 and t not in _STOP
    }


# --- fact list (the fabrication boundary) -----------------------------------
def build_facts(resume: dict) -> list[Fact]:
    """Flatten the SANITIZED résumé into the reorder universe. Calls sanitize_resume FIRST (idempotent),
    so the PII/evidence-strip boundary is enforced HERE regardless of what the caller passes."""
    r = sanitize_resume(resume)
    facts: list[Fact] = []

    for i, role in enumerate(r.get("experience", [])):
        section = " · ".join(p for p in (role.get("org", ""), role.get("role", "")) if p)
        for j, b in enumerate(role.get("bullets", [])):
            text = (b.get("text") or "").strip()
            if not text:
                continue
            kws = tuple(str(k) for k in (b.get("keywords") or []))
            facts.append(Fact(id=f"exp:{i}:{j}", kind="bullet", text=text, section=section, keywords=kws))

    for i, p in enumerate(r.get("projects", [])):
        text = (p.get("text") or "").strip()
        if not text:
            continue
        name = (p.get("name") or "").strip()
        kws = tuple(str(k) for k in (p.get("keywords") or []))
        facts.append(Fact(id=f"proj:{i}", kind="project", text=text, section=name, keywords=kws))

    for i, grp in enumerate(r.get("skills", [])):
        items = [str(x) for x in (grp.get("items") or [])]
        if not items:
            continue
        cat = (grp.get("category") or "").strip()
        text = f"{cat}: {', '.join(items)}" if cat else ", ".join(items)
        # skills carry no curated keywords[] → the items ARE the match signal
        facts.append(
            Fact(id=f"skill:{i}", kind="skill", text=text, section=cat or "Skills", keywords=tuple(items))
        )

    return facts


# --- deterministic tailor ---------------------------------------------------
def tailor(jd_text: str, resume: dict) -> TailoredResume:
    facts = build_facts(resume)
    jd = _tokens(jd_text)

    resume_all: set[str] = set()
    scored: list[tuple[int, list[str], Fact]] = []
    for f in facts:
        kw_tokens = _tokens(" ".join(f.keywords))
        text_tokens = _tokens(f.text)
        resume_all |= kw_tokens | text_tokens
        matched_kw = jd & kw_tokens
        matched_text = jd & text_tokens
        score = 3 * len(matched_kw) + len(matched_text)  # curated keywords weigh more
        matched = sorted(matched_kw | matched_text)[:8]  # every chip ∈ (JD ∩ résumé-side): grounded
        scored.append((score, matched, f))

    # stable sort by score desc — ties preserve build (résumé) order ⇒ deterministic
    order = sorted(range(len(scored)), key=lambda k: -scored[k][0])
    ordered = [
        TailoredFact(
            id=scored[k][2].id,
            kind=scored[k][2].kind,
            text=scored[k][2].text,  # copied verbatim from the built Fact — the zero-fab guarantee
            section=scored[k][2].section,
            score=scored[k][0],
            matched=scored[k][1],
        )
        for k in order
    ]

    gaps = sorted((jd & SKILL_VOCAB) - resume_all)[:12]  # recognized skills the JD wants, résumé lacks
    jd_keywords = sorted(jd & (resume_all | SKILL_VOCAB))[:20]  # the recognized JD terms we keyed on
    return TailoredResume(ordered=ordered, gaps=gaps, jdKeywords=jd_keywords, factCount=len(facts))
