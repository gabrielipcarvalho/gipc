"""LLM eval harness — REAL RUNS ONLY. `python -m app.evals [--offline-only] [--out DIR]`.

Three evals over ONE materialized corpus (the shared substrate — corpus_hash pins what was measured):
1. retrieval  (offline)      hit@6 + MRR over a hand-authored gold set, ranked exactly like the
                             oracle auto-context (cosine + _cap_code(k=6, CODE_CAP)).
2. faithfulness (needs key)  static-knowledge questions; answers via the REAL oracle SYSTEM_PROMPT +
                             _build_user_turn at temperature 0 with tools=[]; an LLM judge grades
                             every claim against the retrieved chunks (strict JSON, temperature 0,
                             one retry; judge failure → ungraded, reduces n — never counted
                             supported). Tool-mediated live answers are OUT OF SCOPE by design.
3. jd_mapping (needs key)    the REAL analyze_jd path (CORPUS_DIR pointed at the materialized dir)
                             against two hand-labelled gold JDs: label accuracy (unmatched labels
                             count INCORRECT and are surfaced) + token-grounding of every evidence
                             string (paraphrase-tolerant stemming — morphology is not fabrication).

THE CARDINAL RULE: no number is ever typed by hand. Results (master + web mirror) are written by
this harness alone; failure/pending/error states are explicit in-file statuses, never fake scores.
Heavy imports (fastembed/anthropic) stay INSIDE functions — pytest imports this module freely.
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
EVALS_DIR = REPO / "services/ai/evals"
WEB_MIRROR = REPO / "apps/web/data/evals.json"

STOPWORDS = frozenset(
    ["with", "from", "that", "this", "have", "has", "and", "the", "for", "was",
     "were", "are", "into", "over", "under", "across", "both"]
)
_SUFFIXES = ("ments", "ment", "ions", "ion", "ings", "ing", "es", "ed", "s")


# ---- corpus materialization (the shared substrate) ---------------------------


def materialize_corpus(out_dir: Path) -> None:
    """Scratch corpus dir mirroring the image bake: sanitized resume + projects + site + code.json."""
    out_dir.mkdir(parents=True, exist_ok=True)
    resume = json.loads((REPO / "resume/resume.json").read_text())
    resume["basics"].pop("phone", None)  # the Dockerfile strip, mirrored (loaders sanitize too)
    resume["basics"].pop("private", None)
    resume.pop("meta", None)
    (out_dir / "resume.json").write_text(json.dumps(resume))
    shutil.copy(REPO / "apps/web/data/projects.json", out_dir / "projects.json")
    shutil.copy(REPO / "services/ai/corpus/site.md", out_dir / "site.md")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "app.code_corpus",
            str(REPO),
            str(REPO / "services/ai/corpus/code-manifest.json"),
            str(out_dir / "code.json"),
        ],
        check=True,
        cwd=REPO / "services/ai",
    )


def corpus_hash(chunks) -> str:
    h = hashlib.sha256()
    for ch in sorted(c.content_hash for c in chunks):
        h.update(ch.encode())
    return h.hexdigest()


# ---- pure scoring helpers (unit-tested without any model) ---------------------


def rank_hits(expected_any: list[str], ranked_titles: list[str]) -> int | None:
    """1-based rank of the first ranked title containing any expected substring, else None."""
    for i, title in enumerate(ranked_titles, 1):
        if any(e in title for e in expected_any):
            return i
    return None


def retrieval_scores(ranks: list[int | None], k: int = 6) -> dict:
    n = len(ranks)
    hits = sum(1 for r in ranks if r is not None and r <= k)
    mrr = sum(1.0 / r for r in ranks if r is not None) / n if n else 0.0
    return {"hit_at_6": round(hits / n, 3) if n else 0.0, "mrr": round(mrr, 3), "n": n}


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


def score_jd_labels(analysis: dict, expect: list[dict]) -> dict:
    """Label accuracy over the gold expectations; unmatched labels count INCORRECT + surfaced."""
    reqs = analysis.get("requirements", [])
    correct = 0
    unmatched: list[str] = []
    wrong: list[dict] = []
    for exp in expect:
        allowed = set(exp["label"].split("|"))
        found = next((r for r in reqs if exp["match"].lower() in r["requirement"].lower()), None)
        if found is None:
            unmatched.append(exp["match"])
            continue
        if found["strength"] in allowed:
            correct += 1
        else:
            wrong.append({"match": exp["match"], "expected": exp["label"], "got": found["strength"]})
    n = len(expect)
    return {
        "label_accuracy": round(correct / n, 3) if n else 0.0,
        "correct": correct,
        "n": n,
        "unmatched_labels": unmatched,
        "wrong_labels": wrong,
    }


# ---- eval runners --------------------------------------------------------------


def _top_chunks(question: str, chunks, vecs, embedder) -> list[dict]:
    """Prod-faithful ranking: cosine over ALL rows, candidate pool = _FETCH_LIMIT (the same
    constant prod's capped path uses), then _cap_code(k=TOP_K, CODE_CAP). score values are inert
    (_cap_code reads only `source`)."""
    import numpy as np

    from .retrieval import _FETCH_LIMIT, CODE_CAP, TOP_K, _cap_code

    qv = np.array(list(embedder.embed([question])))[0]
    qv = qv / np.linalg.norm(qv)
    order = np.argsort(-(vecs @ qv))
    rows = [
        {"source": chunks[i].source, "title": chunks[i].title, "url": chunks[i].url,
         "content": chunks[i].content, "score": 0.0}
        for i in order[:_FETCH_LIMIT]
    ]
    return _cap_code(rows, TOP_K, CODE_CAP)


def _ranked_titles(question: str, chunks, vecs, embedder) -> list[str]:
    return [r["title"] for r in _top_chunks(question, chunks, vecs, embedder)]


def eval_retrieval(gold: dict, chunks, vecs, embedder) -> dict:
    ranks = []
    misses = []
    for q in gold["questions"]:
        titles = _ranked_titles(q["q"], chunks, vecs, embedder)
        r = rank_hits(q["expect_any"], titles)
        ranks.append(r)
        if r is None or r > 6:
            misses.append({"q": q["q"], "top": titles[:3]})
    out = retrieval_scores(ranks)
    out["misses"] = misses
    return out


JUDGE_PROMPT = """You are grading an AI answer for faithfulness. Below are the ONLY source chunks \
the answerer saw, then its answer. Split the answer into individual factual claims and judge each: \
supported=true ONLY if the claim is directly supported by the chunks; anything not in the chunks \
(however plausible) is supported=false. Meta statements ("I don't know", hedges) are not claims.
Respond with ONLY JSON: {"claims":[{"claim":"...","supported":true|false}]}"""


async def eval_faithfulness(gold: dict, chunks, vecs, embedder, llm, cfg) -> dict:
    from .oracle import SYSTEM_PROMPT, _build_user_turn, _esc

    supported = 0
    total = 0
    graded_q = 0
    ungraded = 0
    unsupported_examples: list[str] = []
    questions = [q for q in gold["questions"] if q.get("static")]
    for q in questions:
        top = _top_chunks(q["q"], chunks, vecs, embedder)
        user_turn = _build_user_turn(q["q"], None, top)
        ans = await llm.create(
            model=cfg.anthropic_model,
            max_tokens=cfg.oracle_max_tokens,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_turn}],
            temperature=0,
        )
        answer_text = "".join(b.text for b in ans.content if getattr(b, "type", "") == "text")
        ctx = "\n\n".join(f'<chunk title="{_esc(c["title"])}">{_esc(c["content"])}</chunk>' for c in top)
        verdict = None
        for _ in range(2):  # one retry on malformed judge output
            j = await llm.create(
                model=cfg.anthropic_model,
                max_tokens=1500,
                system=JUDGE_PROMPT,
                messages=[{"role": "user", "content": f"{ctx}\n\n<answer>{_esc(answer_text)}</answer>"}],
                temperature=0,
            )
            jt = "".join(b.text for b in j.content if getattr(b, "type", "") == "text")
            try:
                cand = json.loads(jt[jt.index("{") : jt.rindex("}") + 1])
            except (ValueError, json.JSONDecodeError):
                continue
            claims = cand.get("claims")
            if isinstance(claims, list) and all(isinstance(c, dict) for c in claims):
                verdict = cand  # schema-valid — a wrong-shape parse consumes a retry too
                break
        if not verdict:
            ungraded += 1
            continue
        graded_q += 1
        for c in verdict["claims"]:
            total += 1
            if c.get("supported"):
                supported += 1
            elif len(unsupported_examples) < 3:
                unsupported_examples.append(str(c.get("claim", ""))[:200])
    if graded_q == 0:
        return {"status": "error"}  # nothing graded — never publish a 0.0 that looks measured
    return {
        "supported_ratio": round(supported / total, 3) if total else 0.0,
        "n_claims": total,
        "n": graded_q,
        "ungraded": ungraded,
        "unsupported_examples": unsupported_examples,
    }


async def eval_jd(gold: dict, llm, cfg, resume_text: str) -> dict:
    from .jd import analyze_jd

    per_jd = []
    grounded_all = 0
    grounded_ok = 0
    failing_strings: list[dict] = []
    for spec in gold["jds"]:
        analysis, _tin, _tout = await analyze_jd(spec["jd"], llm, cfg)
        if analysis is None:
            per_jd.append({"name": spec["name"], "status": "error"})
            continue
        a = analysis.model_dump()
        scored = score_jd_labels(a, spec["expect"])
        for r in a["requirements"]:
            for ev in r["evidence"]:
                grounded_all += 1
                ok, failing = evidence_grounded(ev, resume_text)
                if ok:
                    grounded_ok += 1
                elif len(failing_strings) < 5:
                    failing_strings.append({"evidence": ev[:160], "tokens": failing[:6]})
        per_jd.append({"name": spec["name"], **scored})
    graded = [p for p in per_jd if "label_accuracy" in p]
    n_labels = sum(p["n"] for p in graded)
    n_correct = sum(p["correct"] for p in graded)
    if n_labels == 0:
        return {"status": "error"}  # every JD errored — an env bug must not read as a 0.0 score
    return {
        "label_accuracy": round(n_correct / n_labels, 3),
        "n": n_labels,
        "jds": per_jd,
        "evidence_grounded_ratio": round(grounded_ok / grounded_all, 3) if grounded_all else 0.0,
        "n_evidence": grounded_all,
        "ungrounded_examples": failing_strings,
    }


# ---- orchestration --------------------------------------------------------------


async def main(offline_only: bool, out_dir: Path) -> dict:
    import numpy as np
    from fastembed import TextEmbedding

    from .config import get_settings
    from .corpus import load_corpus

    scratch = out_dir / "_corpus"
    materialize_corpus(scratch)
    os.environ["CORPUS_DIR"] = str(scratch)  # analyze_jd reads this at call time
    chunks = load_corpus(scratch)
    from .resume_evidence import resume_evidence_json

    # grounding haystack = the SAME projection analyze_jd's model sees (conservative direction:
    # a token grounding against internal keys the model never saw would inflate the ratio)
    resume_text = resume_evidence_json(scratch)

    embedder = TextEmbedding("BAAI/bge-small-en-v1.5")
    vecs = np.array(list(embedder.embed([c.content for c in chunks])))
    vecs = vecs / np.linalg.norm(vecs, axis=1, keepdims=True)

    gold_r = json.loads((EVALS_DIR / "gold-retrieval.json").read_text())
    gold_j = json.loads((EVALS_DIR / "gold-jd.json").read_text())
    cfg = get_settings()

    results: dict = {
        "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": cfg.anthropic_model,
        "embedder": "BAAI/bge-small-en-v1.5",
        "params": {"k": 6, "code_cap": 2, "answer_temp": 0, "judge_temp": 0,
                   "jd_path": "production analyze_jd params"},
        "corpus_hash": corpus_hash(chunks),
        "evals": {},
    }
    results["evals"]["retrieval"] = eval_retrieval(gold_r, chunks, vecs, embedder)

    if offline_only or not cfg.anthropic_configured:
        prior = EVALS_DIR / "results.json"
        if prior.exists():
            prev = json.loads(prior.read_text())
            if "n" in prev.get("evals", {}).get("faithfulness", {}):
                print(
                    "WARNING: overwriting KEYED results with pending states (offline run). "
                    "Re-run with the key before committing.",
                    file=sys.stderr,
                )
        results["evals"]["faithfulness"] = {"status": "pending"}
        results["evals"]["jd_mapping"] = {"status": "pending"}
    else:
        from .llm import AnthropicLLM

        llm = AnthropicLLM(cfg.anthropic_api_key.get_secret_value())
        results["evals"]["faithfulness"] = await eval_faithfulness(
            gold_r, chunks, vecs, embedder, llm, cfg
        )
        results["evals"]["jd_mapping"] = await eval_jd(gold_j, llm, cfg, resume_text)

    payload = json.dumps(results, indent=1, ensure_ascii=False) + "\n"
    (EVALS_DIR / "results.json").write_text(payload)
    WEB_MIRROR.write_text(payload)  # byte-identical mirror — a pytest pins parity
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline-only", action="store_true")
    ap.add_argument("--out", default="/tmp/gipc-evals")
    args = ap.parse_args()
    res = asyncio.run(main(args.offline_only, Path(args.out)))
    print(json.dumps({k: v for k, v in res["evals"].items()}, indent=1)[:2000])
