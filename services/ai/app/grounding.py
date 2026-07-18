"""Evidence-grounding primitives — shared by the JD analyzer (production reject) and the eval harness.

Pure (only `re` + stdlib), so both jd.py and evals.py import it without pulling any heavy dep. A token is
"grounded" if it, or its light stem, occurs as a substring of the sanitized résumé text. Two consumers:
- `evidence_grounded` (the EVAL's strict measure): a string is grounded iff EVERY ≥4-char non-stopword
  token grounds. Fails on any single ungrounded token (incl. framing words like "listed").
- `is_pure_fabrication` (the PRODUCTION reject): drop a string ONLY if it has real content tokens and NONE
  ground — a claim with no résumé anchor. Deliberately LOOSER than the eval measure, so it keeps
  grounded-core-with-framing ("Kubernetes … listed …") and bare-skill ("AWS", "CI/CD") evidence, and can
  never turn the eval into a tautology (the eval measures raw, pre-reject output regardless).
"""

import re

STOPWORDS = frozenset(
    ["with", "from", "that", "this", "have", "has", "and", "the", "for", "was",
     "were", "are", "into", "over", "under", "across", "both"]
)
_SUFFIXES = ("ments", "ment", "ions", "ion", "ings", "ing", "es", "ed", "s")


def _stem(token: str) -> str:
    for suf in _SUFFIXES:
        if token.endswith(suf) and len(token) - len(suf) >= 4:
            return token[: -len(suf)]
    return token


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.casefold())


def evidence_grounded(evidence: str, resume_text: str) -> tuple[bool, list[str]]:
    """A token is grounded if it, or its stem, occurs as a substring of the sanitized resume text.
    Returns (all_grounded, failing_tokens)."""
    hay = _normalize(resume_text)
    failing = []
    for tok in _normalize(evidence).split():
        if len(tok) < 4 or tok in STOPWORDS:
            continue
        if tok in hay or _stem(tok) in hay:
            continue
        failing.append(tok)
    return (not failing, failing)


def grounding_stats(evidence: str, resume_text: str) -> tuple[int, int]:
    """(qualifying, grounded) over ≥4-char non-stopword tokens: how many are content tokens, and how many
    of those substring/stem-ground to the résumé. Basis for the production reject."""
    hay = _normalize(resume_text)
    qualifying = grounded = 0
    for tok in _normalize(evidence).split():
        if len(tok) < 4 or tok in STOPWORDS:
            continue
        qualifying += 1
        if tok in hay or _stem(tok) in hay:
            grounded += 1
    return qualifying, grounded


def is_pure_fabrication(evidence: str, resume_text: str) -> bool:
    """True iff the evidence has real content tokens but NONE ground — a claim with no résumé anchor.
    The production reject drops exactly these; it KEEPS grounded-core-with-framing (grounded>0) and
    bare-skill strings (qualifying==0, e.g. "AWS"/"CI/CD", vacuously grounded).

    SCOPE — deliberately narrow: this catches only ZERO-ANCHOR hallucinations. A fabrication bolted onto a
    real anchor (e.g. "Kubernetes work at <fake employer>") has grounded>0 and SURVIVES — this is NOT a
    complete fabrication guard. The primary zero-fabrication defense is the résumé-grounded model + the
    verbatim-span SYSTEM_PROMPT + pydantic validation; this is only a last-resort backstop for pure
    hallucinations that slip through."""
    qualifying, grounded = grounding_stats(evidence, resume_text)
    return qualifying > 0 and grounded == 0
