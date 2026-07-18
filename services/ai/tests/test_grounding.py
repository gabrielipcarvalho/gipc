"""Grounding primitives + the production reject predicate (app/grounding.py)."""

from app.grounding import evidence_grounded, grounding_stats, is_pure_fabrication

RESUME = (
    "Skills. Cloud & Infrastructure: Kubernetes (k3s, AKS), Azure, AWS, CI/CD. "
    "Languages: Python, TypeScript. Data: PostgreSQL. Built a RAG pipeline with PyTorch."
)


def test_evidence_grounded_framing_word_fails() -> None:
    # the eval's STRICT measure: one non-résumé framing word ungrounds the whole string
    ok, failing = evidence_grounded("Kubernetes listed in Cloud Infrastructure skills", RESUME)
    assert not ok and "listed" in failing
    assert "kubernetes" not in failing  # the real anchor grounds


def test_evidence_grounded_verbatim_span() -> None:
    ok, failing = evidence_grounded("Python", RESUME)
    assert ok and failing == []


def test_grounding_stats_counts() -> None:
    q, g = grounding_stats("Kubernetes listed in Cloud Infrastructure skills", RESUME)
    assert q == 5 and g == 4  # kubernetes/cloud/infrastructure/skills ground; "listed" does not


def test_bare_skill_kept() -> None:
    # all-short-token skills → qualifying==0 (vacuously grounded) → NOT a fabrication → KEPT
    for skill in ("AWS", "CI/CD", "AKS", "k3s"):
        q, _ = grounding_stats(skill, RESUME)
        assert q == 0, skill
        assert not is_pure_fabrication(skill, RESUME), skill


def test_grounded_core_with_framing_kept() -> None:
    # grounded>0 (the real skills) even though "listed" fails → KEPT, not dropped
    assert not is_pure_fabrication("Kubernetes listed in Cloud Infrastructure skills", RESUME)


def test_pure_fabrication_dropped() -> None:
    # the only content tokens are fabricated proper nouns → qualifying>0, grounded==0 → DROP
    assert is_pure_fabrication("led Zorptech platform migration", RESUME) is True


def test_grounded_multitoken_not_fabrication() -> None:
    assert not is_pure_fabrication("Python and Kubernetes", RESUME)


def test_mixed_fabrication_survives_by_design() -> None:
    # LIMITATION (deliberate): a fabrication bolted onto a real anchor grounds (g>0) → NOT dropped. The
    # reject catches only ZERO-anchor hallucinations; the verbatim-span prompt + grounded model are the
    # primary zero-fab guard. This test pins the scope so no future reader over-trusts the backstop.
    assert not is_pure_fabrication("Kubernetes program at Zorptech Corporation", RESUME)
