import json

import httpx
import pytest

from app import oracle as oracle_mod
from app.config import Settings
from app.llm import set_llm
from app.routes.oracle import OracleRequest

CFG = Settings(anthropic_model="claude-haiku-4-5", tool_rounds_max=4, oracle_max_tokens=700, audit_salt="s")


# ---- fake Anthropic streaming primitives ------------------------------------


class FakeUsage:
    def __init__(self, i, o):
        self.input_tokens = i
        self.output_tokens = o


class FakeText:
    type = "text"

    def __init__(self, text):
        self.text = text


class FakeToolUse:
    type = "tool_use"

    def __init__(self, id, name, inp):
        self.id = id
        self.name = name
        self.input = inp


class FakeMessage:
    def __init__(self, content, stop_reason, usage):
        self.content = content
        self.stop_reason = stop_reason
        self.usage = usage


class FakeStream:
    def __init__(self, deltas, message):
        self._deltas = deltas
        self._message = message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    @property
    def text_stream(self):
        async def gen():
            for d in self._deltas:
                yield d

        return gen()

    async def get_final_message(self):
        return self._message


class ScriptedLLM:
    def __init__(self, steps):
        self._steps = list(steps)
        self.calls = []

    def stream(self, **kw):
        self.calls.append(kw)
        deltas, message = self._steps.pop(0)
        return FakeStream(deltas, message)


class AlwaysToolLLM:
    def __init__(self):
        self.calls = []

    def stream(self, **kw):
        self.calls.append(kw)
        msg = FakeMessage([FakeToolUse("t", "get_status", {})], "tool_use", FakeUsage(10, 2))
        return FakeStream(["x"], msg)


def _frames(chunks: list[str]) -> list[dict]:
    out = []
    for c in chunks:
        c = c.strip()
        if c.startswith("data:"):
            c = c[len("data:"):].strip()
        if c:
            out.append(json.loads(c))
    return out


async def _fake_retrieve(q, k=6):
    return [{"title": "Education", "url": "/resume", "score": 0.91, "content": "PhD from Xidian"}]


async def _fake_dispatch(name, args, http, cfg):
    return {"results": [{"title": "Education", "url": "/resume", "score": 0.91}]}


# ---- the agent loop ---------------------------------------------------------


async def test_loop_tool_then_final(monkeypatch) -> None:
    monkeypatch.setattr(oracle_mod, "retrieve", _fake_retrieve)
    monkeypatch.setattr(oracle_mod, "dispatch", _fake_dispatch)
    llm = ScriptedLLM(
        [
            (["let me look…"], FakeMessage(
                [FakeToolUse("t1", "search_corpus", {"query": "phd"})], "tool_use", FakeUsage(100, 20))),
            (["Gabriel ", "has a PhD [1]."], FakeMessage(
                [FakeText("Gabriel has a PhD [1].")], "end_turn", FakeUsage(200, 50))),
        ]
    )
    req = OracleRequest(message="does he have a phd?", turnstileToken="x")
    out = [f async for f in oracle_mod.run_oracle(req, "1.2.3.4", None, None, llm, CFG)]
    frames = _frames(out)
    kinds = [(f["type"], f.get("kind")) for f in frames]

    assert kinds[0] == ("trace", "retrieval")
    assert ("trace", "tool_call") in kinds
    assert ("trace", "tool_result") in kinds
    tokens = [f["text"] for f in frames if f["type"] == "token"]
    assert "".join(tokens) == "Gabriel has a PhD [1]."
    assert "let me look…" not in tokens  # intermediate pre-tool text NEVER emitted
    done = [f for f in frames if f["type"] == "done"][0]
    assert done["tokens_in"] == 300 and done["tokens_out"] == 70
    assert done["est_cost"] > 0


async def test_loop_caps_at_max_rounds(monkeypatch) -> None:
    monkeypatch.setattr(oracle_mod, "retrieve", _fake_retrieve)
    monkeypatch.setattr(oracle_mod, "dispatch", _fake_dispatch)
    llm = AlwaysToolLLM()
    req = OracleRequest(message="loop forever?", turnstileToken="x")
    out = [f async for f in oracle_mod.run_oracle(req, "1.2.3.4", None, None, llm, CFG)]
    # 4 tool rounds + 1 forced (tool_choice=none) answer = 5 calls, then terminal
    assert len(llm.calls) == 5
    assert llm.calls[-1]["tool_choice"] == {"type": "none"}
    assert [f for f in _frames(out) if f["type"] == "done"]


async def test_empty_final_answer_fallback(monkeypatch) -> None:
    monkeypatch.setattr(oracle_mod, "retrieve", _fake_retrieve)
    llm = ScriptedLLM([([], FakeMessage([], "end_turn", FakeUsage(10, 0)))])
    req = OracleRequest(message="hi", turnstileToken="x")
    out = _frames([f async for f in oracle_mod.run_oracle(req, "1.2.3.4", None, None, llm, CFG)])
    tokens = [f["text"] for f in out if f["type"] == "token"]
    assert len(tokens) == 1 and tokens[0]  # honest fallback, never zero token frames


# ---- the route guards -------------------------------------------------------


@pytest.fixture
def app_client(monkeypatch):
    from app.main import create_app

    async def _true(*a, **k):
        return True

    async def _budget_ok(*a, **k):
        return 5.0

    monkeypatch.setattr("app.turnstile.verify", _true)
    monkeypatch.setattr("app.routes.oracle.budget_remaining", _budget_ok)
    monkeypatch.setattr(oracle_mod, "retrieve", _fake_retrieve)
    monkeypatch.setattr(oracle_mod, "dispatch", _fake_dispatch)
    app = create_app()
    app.state.http = object()  # unused (turnstile+dispatch mocked); just must exist
    transport = httpx.ASGITransport(app=app)

    def _mk():
        return httpx.AsyncClient(transport=transport, base_url="http://t")

    yield app, _mk
    set_llm(None)


BODY = {"message": "does he have a phd?", "turnstileToken": "x"}


async def test_no_key_503(app_client) -> None:
    app, mk = app_client
    set_llm(None)
    async with mk() as c:
        r = await c.post("/api/ai/oracle", json=BODY)
    assert r.status_code == 503
    assert r.json()["error"] == "oracle not configured"


async def test_turnstile_invalid_403(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _false(*a, **k):
        return False

    monkeypatch.setattr("app.turnstile.verify", _false)
    set_llm(ScriptedLLM([]))
    async with mk() as c:
        r = await c.post("/api/ai/oracle", json={"message": "hi", "turnstileToken": ""})
    assert r.status_code == 403
    assert r.json()["error"] == "turnstile"


async def test_budget_out_503_before_llm(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _spent(*a, **k):
        return 0.0

    monkeypatch.setattr("app.routes.oracle.budget_remaining", _spent)
    llm = ScriptedLLM([])
    set_llm(llm)
    async with mk() as c:
        r = await c.post("/api/ai/oracle", json=BODY)
    assert r.status_code == 503
    assert "budget" in r.json()["error"]
    assert llm.calls == []  # no model call once budget is spent


async def test_busy_503(app_client) -> None:
    import asyncio

    app, mk = app_client
    app.state.oracle_sem = asyncio.Semaphore(0)  # no slots
    set_llm(ScriptedLLM([]))
    async with mk() as c:
        r = await c.post("/api/ai/oracle", json=BODY)
    assert r.status_code == 503
    assert "busy" in r.json()["error"]


async def test_oversized_history_422(app_client) -> None:
    app, mk = app_client
    set_llm(ScriptedLLM([]))
    body = {**BODY, "history": [{"role": "user", "content": "x"}] * 13}
    async with mk() as c:
        r = await c.post("/api/ai/oracle", json=body)
    assert r.status_code == 422


async def test_happy_path_streams_frames(app_client) -> None:
    app, mk = app_client
    set_llm(
        ScriptedLLM(
            [
                (["look…"], FakeMessage(
                    [FakeToolUse("t1", "search_corpus", {"query": "phd"})], "tool_use", FakeUsage(100, 20))),
                (["Gabriel has a PhD [1]."], FakeMessage(
                    [FakeText("Gabriel has a PhD [1].")], "end_turn", FakeUsage(200, 50))),
            ]
        )
    )
    async with mk() as c:
        r = await c.post("/api/ai/oracle", json=BODY)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    frames = _frames([b for b in r.text.split("\n\n") if b.strip()][:])  # noqa
    types = [f["type"] for f in frames]
    assert types[0] == "trace" and types[-1] == "done"
    assert "token" in types
