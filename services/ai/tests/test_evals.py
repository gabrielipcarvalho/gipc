"""Eval-harness suite — gold-set integrity pins, pure scoring math, results honesty."""

import ast
import json
from pathlib import Path

import pytest

from app.corpus import load_corpus
from app.evals import (
    EVALS_DIR,
    WEB_MIRROR,
    corpus_hash,
    evidence_grounded,
    materialize_corpus,
    rank_hits,
    retrieval_scores,
    score_jd_labels,
)

REPO = Path(__file__).resolve().parents[3]
GOLD_R = json.loads((EVALS_DIR / "gold-retrieval.json").read_text())
GOLD_J = json.loads((EVALS_DIR / "gold-jd.json").read_text())


# ---- gold-set integrity ---------------------------------------------------------


@pytest.fixture(scope="module")
def real_titles(tmp_path_factory) -> list[str]:
    d = tmp_path_factory.mktemp("corpus")
    materialize_corpus(d)
    return [c.title for c in load_corpus(d)]


def test_gold_retrieval_shape() -> None:
    assert len(GOLD_R["questions"]) >= 12
    for q in GOLD_R["questions"]:
        assert q["q"] and q["expect_any"] and isinstance(q["static"], bool)


def test_gold_substrings_occur_in_real_corpus(real_titles: list[str]) -> None:
    for q in GOLD_R["questions"]:
        for sub in q["expect_any"]:
            assert any(sub in t for t in real_titles), f"gold substring drifted: {sub!r}"


def test_gold_substrings_are_discriminating(real_titles: list[str]) -> None:
    """Specificity pin: each expect_any substring matches exactly 1 title (≤2 with a why field)."""
    for q in GOLD_R["questions"]:
        for sub in q["expect_any"]:
            n = sum(1 for t in real_titles if sub in t)
            limit = 2 if "why_two" in q or "why_dual" in q else 1
            assert 1 <= n <= limit, f"{sub!r} matches {n} titles (limit {limit})"


def test_gold_jd_shape_and_label_rules() -> None:
    assert len(GOLD_J["jds"]) == 2
    for spec in GOLD_J["jds"]:
        assert len(spec["jd"]) <= 8000  # prod JD_MAX
        assert 7 <= len(spec["expect"]) <= 10
        duals = [e for e in spec["expect"] if "|" in e["label"]]
        assert len(duals) <= 2, "dual labels inflate accuracy — ≤2 per JD"
        for d in duals:
            assert "why_dual" in d
        for e in spec["expect"]:
            assert set(e["label"].split("|")) <= {"strong", "partial", "gap"}


def test_gold_jd_gap_labels_have_zero_resume_evidence() -> None:
    resume = (REPO / "resume/resume.json").read_text().casefold()
    for spec in GOLD_J["jds"]:
        for e in spec["expect"]:
            if e["label"] == "gap":
                assert e["match"].casefold() not in resume, f"{e['match']} is evidenced — not a gap"


# ---- pure scoring math ------------------------------------------------------------


def test_rank_hits() -> None:
    titles = ["A one", "B two", "C three"]
    assert rank_hits(["two"], titles) == 2
    assert rank_hits(["zzz"], titles) is None
    assert rank_hits(["three", "one"], titles) == 1  # first match wins


def test_retrieval_scores() -> None:
    s = retrieval_scores([1, 3, None, 7], k=6)
    assert s["n"] == 4
    assert s["hit_at_6"] == 0.5  # ranks 1,3 hit; None + 7 miss
    assert s["mrr"] == round((1 + 1 / 3 + 0 + 1 / 7) / 4, 3)


def test_evidence_grounded_stemming() -> None:
    resume = "reduced deployment time using kubernetes"
    ok, failing = evidence_grounded("cut deployments dramatically", resume)
    # deployments → stem "deployment" grounded; dramatically → stem "dramatical" NOT grounded
    assert not ok and failing == ["dramatically"]
    ok2, _ = evidence_grounded("kubernetes deployment", resume)
    assert ok2


def test_score_jd_labels_unmatched_counts_incorrect() -> None:
    analysis = {"requirements": [{"requirement": "Kubernetes ops", "strength": "strong", "evidence": []}]}
    expect = [
        {"match": "Kubernetes", "label": "strong"},
        {"match": "Fortran", "label": "gap"},  # model never emitted it → unmatched → incorrect
    ]
    s = score_jd_labels(analysis, expect)
    assert s["label_accuracy"] == 0.5
    assert s["unmatched_labels"] == ["Fortran"]


def test_score_jd_labels_dual() -> None:
    analysis = {"requirements": [{"requirement": "Terraform IaC", "strength": "partial", "evidence": []}]}
    s = score_jd_labels(analysis, [{"match": "Terraform", "label": "strong|partial"}])
    assert s["label_accuracy"] == 1.0


# ---- results honesty ---------------------------------------------------------------


def _results_paths() -> tuple[Path, Path]:
    return EVALS_DIR / "results.json", WEB_MIRROR


def test_results_parity_and_honesty() -> None:
    master, mirror = _results_paths()
    if not master.exists() and not mirror.exists():
        pytest.skip("pre-first-run tree — both absent is legal until the harness runs")
    assert master.exists() and mirror.exists(), "exactly one results file exists — parity broken"
    assert master.read_bytes() == mirror.read_bytes(), "master and web mirror diverged"
    r = json.loads(master.read_text())
    assert r["run_at"] and r["model"] and len(r["corpus_hash"]) == 64
    for name, ev in r["evals"].items():
        has_status = ev.get("status") in {"pending", "error"}
        has_numbers = "n" in ev and ev["n"] > 0
        assert has_status != has_numbers, f"{name}: must have real numbers XOR a status"


def test_results_contain_no_secrets() -> None:
    master, _ = _results_paths()
    if not master.exists():
        pytest.skip("no results yet")
    text = master.read_text()
    assert "sk-ant-" not in text and "api-key" not in text


# ---- import hygiene -----------------------------------------------------------------


def test_evals_module_defers_heavy_imports() -> None:
    tree = ast.parse((REPO / "services/ai/app/evals.py").read_text())
    top = set()
    for node in tree.body:  # module level only — function bodies may import anything
        if isinstance(node, ast.Import):
            top |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            top.add(node.module.split(".")[0])
    assert "fastembed" not in top and "anthropic" not in top and "numpy" not in top
    assert top - {"argparse", "asyncio", "hashlib", "json", "os", "shutil",
                  "subprocess", "sys", "time", "pathlib", "grounding"} == set(), top


def test_corpus_hash_deterministic(real_titles) -> None:
    # same chunks → same hash regardless of order
    class FakeChunk:
        def __init__(self, h): self.content_hash = h
    a = [FakeChunk("b"), FakeChunk("a")]
    b = [FakeChunk("a"), FakeChunk("b")]
    assert corpus_hash(a) == corpus_hash(b)


# ---- cross-model judge kwargs (Sprint I P3) ----------------------------------------------


class _StubEmbedder:
    def embed(self, texts):
        import numpy as np

        return [np.ones(4, dtype="float32") for _ in texts]


class _KwargLLM:
    """Records every create() kwarg; returns a canned answer then a valid judge verdict."""

    def __init__(self):
        self.calls = []

    async def create(self, **kw):
        self.calls.append(kw)

        class _B:
            type = "text"

        b = _B()
        if kw.get("system", "").startswith("You are grading"):
            b.text = '{"claims": [{"claim": "x", "supported": true}]}'
        else:
            b.text = "An answer."

        class _M:
            content = [b]

        return _M()


async def _run_one_question(judge):
    from types import SimpleNamespace

    import numpy as np

    from app.config import Settings
    from app.evals import eval_faithfulness

    gold = {"questions": [{"q": "one?", "static": True, "expect_any": ["x"]}]}
    chunks = [SimpleNamespace(title="t", url="/resume", content="c", source="resume")]
    vecs = np.ones((1, 4), dtype="float32")
    llm = _KwargLLM()
    cfg = Settings()
    await eval_faithfulness(gold, chunks, vecs, _StubEmbedder(), llm, cfg, judge=judge)
    return llm.calls


async def test_cross_model_judge_kwargs():
    calls = await _run_one_question("claude-sonnet-5")
    judge_calls = [c for c in calls if c.get("system", "").startswith("You are grading")]
    assert judge_calls, "judge never called"
    jk = judge_calls[0]
    assert jk["model"] == "claude-sonnet-5"
    assert "temperature" not in jk  # 5-gen judges reject non-default sampling params
    assert jk["thinking"] == {"type": "disabled"}
    assert jk["max_tokens"] == 2500


async def test_same_model_judge_kwargs_unchanged():
    calls = await _run_one_question(None)
    judge_calls = [c for c in calls if c.get("system", "").startswith("You are grading")]
    jk = judge_calls[0]
    assert jk["temperature"] == 0
    assert jk["max_tokens"] == 1500
    assert "thinking" not in jk
