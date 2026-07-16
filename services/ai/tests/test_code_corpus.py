"""Self-aware code-corpus suite — manifest hygiene, extractor safety, retrieval cap."""

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

from app.code_corpus import EXCERPT_CAP, build, excerpt, find_secret
from app.corpus import code_chunks, load_corpus
from app.retrieval import CODE_CAP, _cap_code

from .test_corpus import AU_MOBILE, PHONE_DIGITS, PRIVATE_TEXT, _corpus_dir

REPO = Path(__file__).resolve().parents[3]
MANIFEST = REPO / "services/ai/corpus/code-manifest.json"
SPEC = json.loads(MANIFEST.read_text())

# constructStation triggers (apps/web/data/construct.ts) — a manifest path matching one would map a
# code citation to a bogus Construct station if the url-guard ever regressed.
STATION_PREFIXES = ("skills", "experience", "project", "work", "publication", "education", "gabriel")
STATION_SUBSTRINGS = ("award", "leadership", "profile", "certification")


# ---- manifest hygiene --------------------------------------------------------


def test_manifest_paths_under_allowed_roots() -> None:
    roots = SPEC["allowed_roots"]
    for entry in SPEC["files"]:
        assert any(
            entry["path"] == r or entry["path"].startswith(r + "/") for r in roots
        ), entry["path"]


def test_manifest_paths_exist_and_are_git_tracked() -> None:
    tracked = set(
        subprocess.run(
            ["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.split()
    )
    for entry in SPEC["files"]:
        assert (REPO / entry["path"]).is_file(), f"missing on disk: {entry['path']}"
        assert entry["path"] in tracked, f"not git-tracked (dead GitHub link): {entry['path']}"


def test_manifest_no_duplicates_and_no_station_trigger_paths() -> None:
    paths = [e["path"] for e in SPEC["files"]]
    assert len(paths) == len(set(paths))
    for p in paths:
        low = p.lower()
        assert not low.startswith(STATION_PREFIXES), p
        assert not any(s in low for s in STATION_SUBSTRINGS), p


def test_manifest_base_url_is_the_public_repo_main() -> None:
    assert SPEC["base_url"] == "https://github.com/gabrielipcarvalho/gipc/blob/main/"


# ---- extractor: stdlib-only (builder runs SYSTEM python, no deps) --------------


def test_code_corpus_module_imports_are_stdlib_only() -> None:
    tree = ast.parse((REPO / "services/ai/app/code_corpus.py").read_text())
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.add(node.module.split(".")[0])
    assert imported <= set(sys.stdlib_module_names), imported - set(sys.stdlib_module_names)


# ---- excerpt -----------------------------------------------------------------


def test_excerpt_cap_and_determinism() -> None:
    text = (REPO / "apps/web/app/resume/Immersive.tsx").read_text()
    a = excerpt(text, "apps/web/app/resume/Immersive.tsx")
    b = excerpt(text, "apps/web/app/resume/Immersive.tsx")
    assert a == b
    assert len(a) <= EXCERPT_CAP
    assert "immersive layer" in a.lower()  # the header block comment survives the trim


def test_excerpt_prefers_comment_blocks() -> None:
    src = '"""Module doc — the semantics."""\n\ndef fn(x: int) -> int:\n    return x\n'
    out = excerpt(src, "x.py")
    assert out.index("semantics") < out.index("def fn")


# ---- secret guard ------------------------------------------------------------


def test_secret_guard_no_false_positive_on_real_sources() -> None:
    for rel in ("services/ai/app/config.py", "services/ai/app/turnstile.py"):
        assert find_secret((REPO / rel).read_text()) is None, rel


def test_secret_guard_catches_synthetic_values() -> None:
    # built by concatenation so repo-wide secret scans never match THIS file
    fake_key = "sk-" + "ant-" + "a" * 24
    assert find_secret(f'KEY = "{fake_key}"') is not None
    pem = "BEGIN " + "PRIVATE" + " KEY"
    assert find_secret(pem) is not None
    entropy = '"' + "A1b2" * 12 + '"'
    assert find_secret(entropy) is not None


def test_secret_guard_spares_url_literals() -> None:
    url = '"https://challenges.cloudflare.com/turnstile/v0/siteverify"'
    assert find_secret(url) is None


# ---- build -------------------------------------------------------------------


def _mini_repo(tmp_path: Path) -> tuple[Path, Path]:
    root = tmp_path / "repo"
    (root / "apps/web/app").mkdir(parents=True)
    (root / "apps/web/app/x.ts").write_text("/* the x component */\nexport const x = 1\n")
    manifest = tmp_path / "m.json"
    manifest.write_text(
        json.dumps(
            {
                "base_url": "https://github.com/o/r/blob/main/",
                "allowed_roots": ["apps/web/app"],
                "files": [{"path": "apps/web/app/x.ts", "note": "x"}],
            }
        )
    )
    return root, manifest


def test_build_happy_path(tmp_path: Path) -> None:
    root, manifest = _mini_repo(tmp_path)
    out = tmp_path / "code.json"
    n = build(root, manifest, out)
    assert n == 1
    items = json.loads(out.read_text())
    assert items[0]["url"] == "https://github.com/o/r/blob/main/apps/web/app/x.ts"
    assert "x component" in items[0]["excerpt"]


def test_build_rejects_path_escape(tmp_path: Path) -> None:
    root, manifest = _mini_repo(tmp_path)
    spec = json.loads(manifest.read_text())
    spec["files"].append({"path": "career/secret.md", "note": ""})
    manifest.write_text(json.dumps(spec))
    try:
        build(root, manifest, tmp_path / "o.json")
        raise AssertionError("expected ValueError")
    except ValueError as e:
        assert "allowed_roots" in str(e)


def test_build_rejects_missing_file(tmp_path: Path) -> None:
    root, manifest = _mini_repo(tmp_path)
    spec = json.loads(manifest.read_text())
    spec["files"].append({"path": "apps/web/app/gone.ts", "note": ""})
    manifest.write_text(json.dumps(spec))
    try:
        build(root, manifest, tmp_path / "o.json")
        raise AssertionError("expected FileNotFoundError")
    except FileNotFoundError:
        pass


def test_build_rejects_secret_values(tmp_path: Path) -> None:
    root, manifest = _mini_repo(tmp_path)
    fake = "ghp_" + "B" * 32
    (root / "apps/web/app/x.ts").write_text(f'/* c */\nconst t = "{fake}"\n')
    try:
        build(root, manifest, tmp_path / "o.json")
        raise AssertionError("expected ValueError")
    except ValueError as e:
        assert "secret" in str(e)


# ---- code_chunks + load_corpus integration ------------------------------------


def test_code_chunks_shape_and_skip_empty() -> None:
    items = [
        {"path": "a/b.ts", "url": "https://github.com/o/r/blob/main/a/b.ts", "note": "n", "excerpt": "e"},
        {"path": "a/c.ts", "url": "https://github.com/o/r/blob/main/a/c.ts", "note": "n", "excerpt": "  "},
    ]
    chunks = code_chunks(items)
    assert len(chunks) == 1
    c = chunks[0]
    assert c.source == "code" and c.title == "a/b.ts" and c.content.startswith("n\n\n")


def test_load_corpus_without_code_json_unchanged(tmp_path: Path) -> None:
    chunks = load_corpus(_corpus_dir(tmp_path))
    assert all(c.source in {"resume", "projects", "site"} for c in chunks)


def test_load_corpus_with_code_json(tmp_path: Path) -> None:
    d = _corpus_dir(tmp_path)
    item = {"path": "p.ts", "url": "https://github.com/o/r/blob/main/p.ts", "note": "n", "excerpt": "e"}
    (d / "code.json").write_text(json.dumps([item]))
    chunks = load_corpus(d)
    assert sum(1 for c in chunks if c.source == "code") == 1


# ---- privacy: real manifest excerpts leak nothing ------------------------------


def test_real_code_corpus_has_no_private_data(tmp_path: Path) -> None:
    out = tmp_path / "code.json"
    build(REPO, MANIFEST, out)
    text = out.read_text()
    if PHONE_DIGITS:
        assert PHONE_DIGITS not in re.sub(r"\D", "", text)
    assert not AU_MOBILE.search(text)
    assert PRIVATE_TEXT not in text


# ---- retrieval cap (pure filter — no DB) ---------------------------------------


def _rows(*sources: str) -> list[dict]:
    return [
        {"source": s, "title": f"t{i}", "url": "/", "content": "c", "score": 1.0 - i * 0.01}
        for i, s in enumerate(sources)
    ]


def test_cap_code_admits_at_most_cap_then_fills_with_noncode() -> None:
    rows = _rows("code", "code", "code", "code", "resume", "resume", "site", "projects")
    kept = _cap_code(rows, 6, CODE_CAP)
    assert sum(1 for r in kept if r["source"] == "code") == CODE_CAP
    assert len(kept) == 6


def test_cap_code_no_code_rows_is_identity_topk() -> None:
    rows = _rows("resume", "site", "projects", "resume", "site", "projects", "resume")
    assert _cap_code(rows, 6, CODE_CAP) == rows[:6]


def test_cap_code_preserves_score_order() -> None:
    rows = _rows("code", "resume", "code", "site", "code", "projects")
    kept = _cap_code(rows, 6, 2)
    scores = [r["score"] for r in kept]
    assert scores == sorted(scores, reverse=True)
    assert [r["source"] for r in kept] == ["code", "resume", "code", "site", "projects"]


def test_code_corpus_never_references_private_paths() -> None:
    # mirrors test_corpus's loader-path guard: the private evidence dir must never be a source
    src = (REPO / "services/ai/app/code_corpus.py").read_text()
    assert "career/" not in src
