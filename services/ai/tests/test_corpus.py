"""Corpus + privacy suite — THE invariant tests."""

import inspect
import json
import re
from pathlib import Path

from app import corpus
from app.corpus import BASICS_PUBLIC_FIELDS, load_corpus, resume_chunks, site_chunks

REPO = Path(__file__).resolve().parents[3]
RESUME = json.loads((REPO / "resume" / "resume.json").read_text())
PHONE_DIGITS = re.sub(r"\D", "", RESUME["basics"].get("phone", "") or "NONE")
PRIVATE_TEXT = str(RESUME["basics"].get("private", "") or "\x00none")
AU_MOBILE = re.compile(r"(\+?61|0)[\s-]?4\d{2}[\s-]?\d{3}[\s-]?\d{3}")


def _corpus_dir(tmp_path: Path) -> Path:
    (tmp_path / "resume.json").write_text(json.dumps(RESUME))
    (tmp_path / "projects.json").write_text((REPO / "apps/web/data/projects.json").read_text())
    (tmp_path / "site.md").write_text((REPO / "services/ai/corpus/site.md").read_text())
    return tmp_path


def test_basics_allowlist_is_exactly_the_8_public_fields() -> None:
    assert {
        "name", "label", "location", "email", "site", "profiles", "workRights", "summary",
    } == BASICS_PUBLIC_FIELDS
    assert "phone" not in BASICS_PUBLIC_FIELDS
    assert "private" not in BASICS_PUBLIC_FIELDS


def test_no_private_source_paths() -> None:
    src = inspect.getsource(corpus)
    assert "career/" not in src
    assert ".keys" not in src


def test_chunks_never_contain_phone_or_private(tmp_path: Path) -> None:
    chunks = load_corpus(_corpus_dir(tmp_path))
    assert len(chunks) > 10
    for c in chunks:
        digits = re.sub(r"\D", "", c.content)
        assert PHONE_DIGITS not in digits, f"phone digits leaked in: {c.title}"
        local = PHONE_DIGITS.removeprefix("61")  # national digits, country code stripped
        assert local not in digits, f"local phone digits leaked in: {c.title}"
        assert not AU_MOBILE.search(c.content), f"AU mobile pattern in: {c.title}"
        assert PRIVATE_TEXT not in c.content, f"basics.private leaked in: {c.title}"
        assert "career/" not in c.content, f"career path leaked in: {c.title}"


def test_resume_chunks_cover_sections() -> None:
    chunks = resume_chunks(RESUME)
    titles = " | ".join(c.title for c in chunks)
    for expected in ["profile", "Skills", "Experience", "Publication", "Education"]:
        assert expected in titles
    assert all(c.content.strip() for c in chunks)


def test_hash_stability_and_uniqueness(tmp_path: Path) -> None:
    a = load_corpus(_corpus_dir(tmp_path))
    b = load_corpus(_corpus_dir(tmp_path))
    assert [c.content_hash for c in a] == [c.content_hash for c in b]  # deterministic
    assert len({c.content_hash for c in a}) == len(a)  # unique


def test_site_chunks_parse_sections() -> None:
    chunks = site_chunks("# One\nurl: /a\nbody A\n\n# Two\nurl: /b\nbody B")
    assert [(c.title, c.url) for c in chunks] == [("One", "/a"), ("Two", "/b")]
