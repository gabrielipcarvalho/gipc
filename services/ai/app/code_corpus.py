"""Build-time code-corpus extractor — runs INSIDE the Docker builder under SYSTEM python.

HARD CONSTRAINT: stdlib-only. This module must never import app.log/app.config or any third-party
package (the builder has no venv on PATH); a hygiene test enforces it. Failures here break the image
build loudly — they can never reach the runtime.

The manifest (services/ai/corpus/code-manifest.json) is the ONLY selection authority: explicit paths
under explicit allowed_roots, each with a one-line human note that leads the chunk content (the note
carries retrieval semantics; the embed window truncates tails, never heads).
"""

import json
import re
import sys
from pathlib import Path

EXCERPT_CAP = 1800  # chars per file after trimming

# Secret VALUES only — never identifier names (config.py declares anthropic_api_key etc. and holds
# Cloudflare's 35-char always-pass test sitekey; turnstile.py posts data={"secret": ...}; none may
# trip). The PEM pattern is built with \s+ so verify.sh's own literal-text scan never matches THIS
# file. High-entropy check excludes URL-ish strings (dots/slashes) to spare long endpoint literals.
SECRET_PATTERNS = [
    re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{30,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|PGP\s+)?PRIVATE"),
    # quoted high-entropy literal ≥ 40 chars: base64/hex-ish, no dots/slashes (URLs/paths exempt)
    re.compile(r"""["'][A-Za-z0-9+=_-]{40,}["']"""),
]

_COMMENT_BLOCK_RE = re.compile(
    r"(/\*.*?\*/"  # /* ... */ blocks (TS/CSS)
    r'|""".*?"""'  # python docstrings
    r"|(?:^[ \t]*(?://|#)[^\n]*(?:\n|$))+)",  # runs of // or # line comments (EOF-safe)
    re.DOTALL | re.MULTILINE,
)
_SIGNATURE_RE = re.compile(
    r"^[ \t]*(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface)\s+\w+"
    r"|(?:async\s+)?def\s+\w+\([^)]*\)"
    r"|class\s+\w+"
    r"|(?:apiVersion|kind|name):\s*\S+"
    r")[^\n]*",
    re.MULTILINE,
)


def find_secret(text: str) -> str | None:
    """First secret-looking VALUE in text, or None."""
    for pat in SECRET_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(0)[:24]
    return None


def excerpt(text: str, path: str) -> str:
    """Comment-first trim: all comment blocks/docstrings in file order, then signature lines as
    budget remains. Deterministic, ≤ EXCERPT_CAP chars. This codebase carries its semantics in
    block comments — signatures alone explain little."""
    parts: list[str] = []
    used = 0
    for m in _COMMENT_BLOCK_RE.finditer(text):
        block = m.group(0).strip()
        if not block or used + len(block) + 2 > EXCERPT_CAP:
            continue
        parts.append(block)
        used += len(block) + 2
    if used < EXCERPT_CAP:
        for m in _SIGNATURE_RE.finditer(text):
            line = m.group(0).strip()
            if used + len(line) + 1 > EXCERPT_CAP:
                break
            parts.append(line)
            used += len(line) + 1
    out = "\n\n".join(parts)
    return out[:EXCERPT_CAP]


def build(repo_root: Path, manifest: Path, out: Path) -> int:
    """Extract excerpts for every manifest file; write [{path,url,note,excerpt}] JSON to `out`.
    Raises (→ build failure) on: path outside allowed_roots, missing file, secret-pattern hit."""
    spec = json.loads(manifest.read_text())
    base_url: str = spec["base_url"]
    roots: list[str] = spec["allowed_roots"]
    items: list[dict] = []
    seen: set[str] = set()
    for entry in spec["files"]:
        rel = entry["path"]
        if rel in seen:
            raise ValueError(f"duplicate manifest path: {rel}")
        seen.add(rel)
        if not any(rel == r or rel.startswith(r + "/") for r in roots):
            raise ValueError(f"manifest path outside allowed_roots: {rel}")
        f = repo_root / rel
        if not f.is_file():
            raise FileNotFoundError(f"manifest file missing from build context: {rel}")
        text = f.read_text(encoding="utf-8", errors="replace")
        hit = find_secret(text)
        if hit:
            raise ValueError(f"secret-looking value in {rel}: {hit}…")
        ex = excerpt(text, rel)
        if not ex.strip():
            print(f"code_corpus: skipped (empty excerpt): {rel}", file=sys.stderr)
            continue
        items.append({"path": rel, "url": base_url + rel, "note": entry.get("note", ""), "excerpt": ex})
    out.write_text(json.dumps(items, indent=1))
    return len(items)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("usage: python -m app.code_corpus <repo_root> <manifest> <out>", file=sys.stderr)
        raise SystemExit(2)
    n = build(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
    print(f"code corpus: {n} files excerpted")
