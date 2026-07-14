"""The JD analyzer's evidence base — a sanitized projection of the full structured résumé.

THE LOADER IS THE PRIVACY BOUNDARY (do NOT trust the image build strip): it allow-lists `basics` to the
same public fields as the corpus, drops `meta`/`$schema` (which reference the private career/ dir), and
strips every internal `evidence` id. So even against the RAW repo resume.json, no phone/private/meta/
evidence reaches the prompt.
"""

import json
from pathlib import Path
from typing import Any

from .corpus import BASICS_PUBLIC_FIELDS

# sections whose items carry an internal `evidence` id to strip
_EVIDENCE_SECTIONS = (
    "projects",
    "publications",
    "education",
    "certifications",
    "awards",
    "leadership",
)


def _strip_evidence(item: Any) -> Any:
    if isinstance(item, dict):
        return {k: _strip_evidence(v) for k, v in item.items() if k != "evidence"}
    if isinstance(item, list):
        return [_strip_evidence(x) for x in item]
    return item


def sanitize_resume(resume: dict) -> dict:
    out: dict[str, Any] = {}
    if "basics" in resume:
        out["basics"] = {k: v for k, v in resume["basics"].items() if k in BASICS_PUBLIC_FIELDS}
    if "skills" in resume:
        out["skills"] = resume["skills"]
    if "experience" in resume:
        # bullets are {text, evidence, keywords} — keep text/keywords, drop evidence
        out["experience"] = [
            {
                **{k: v for k, v in role.items() if k != "bullets"},
                "bullets": [_strip_evidence(b) for b in role.get("bullets", [])],
            }
            for role in resume["experience"]
        ]
    for section in _EVIDENCE_SECTIONS:
        if section in resume:
            out[section] = _strip_evidence(resume[section])
    return out  # `meta` and `$schema` are never copied


def load_resume_evidence(corpus_dir: Path) -> dict:
    raw = json.loads((corpus_dir / "resume.json").read_text())
    return sanitize_resume(raw)


def resume_evidence_json(corpus_dir: Path) -> str:
    return json.dumps(load_resume_evidence(corpus_dir), separators=(",", ":"))
