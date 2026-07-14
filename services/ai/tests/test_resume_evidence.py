import json
from pathlib import Path

from app.corpus import BASICS_PUBLIC_FIELDS
from app.resume_evidence import sanitize_resume

REPO = Path(__file__).resolve().parents[3]
RAW = json.loads((REPO / "resume" / "resume.json").read_text())


def test_sanitize_strips_private_and_evidence() -> None:
    out = sanitize_resume(RAW)  # tested against the RAW repo file — proves the loader IS the boundary
    blob = json.dumps(out)
    assert "phone" not in out["basics"]
    assert "private" not in out["basics"]
    assert "meta" not in out
    assert "$schema" not in out
    # no internal evidence ids anywhere
    assert "evidence" not in blob
    for marker in ("JDL-", "CHAT-", "GEM-", "GIT-"):
        assert marker not in blob, f"evidence id {marker} survived"


def test_basics_allowlisted_to_public_fields() -> None:
    out = sanitize_resume(RAW)
    assert set(out["basics"]).issubset(BASICS_PUBLIC_FIELDS)


def test_evidence_survives_facts() -> None:
    out = sanitize_resume(RAW)
    assert len(out["skills"]) == len(RAW["skills"])
    assert len(out["experience"]) == len(RAW["experience"])
    assert len(out["projects"]) == len(RAW["projects"])
    # experience bullets keep their human-readable text
    assert out["experience"][0]["bullets"][0]["text"]
