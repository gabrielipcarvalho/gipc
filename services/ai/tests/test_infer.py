"""Local-inference (/api/ai/infer) suite — stream frames, stats math, guards, sem contract."""

import asyncio
import json

import httpx
import pytest

from app.config import Settings
from app.infer import InferUnavailable, _stats_frame, stream_infer

CFG = Settings(
    ollama_model="qwen-test",
    price_in_per_mtok=1.0,
    price_out_per_mtok=5.0,
    audit_salt="s",
)
CFG_TURNSTILE = Settings(
    ollama_model="qwen-test",
    turnstile_secret="real-looking-secret",  # non-test value → turnstile_enabled=True
    audit_salt="s",
)

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _ndjson(*chunks: dict) -> bytes:
    return "".join(json.dumps(c) + "\n" for c in chunks).encode()


def _mock_http(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _frames(raw: list[str]) -> list[dict]:
    out = []
    for f in raw:
        f = f.strip()
        if f.startswith("data:"):
            out.append(json.loads(f[len("data:"):].strip()))
    return out


OK_CHUNKS = _ndjson(
    {"response": "Hello"},
    {"response": " world"},
    {
        "response": "",
        "done": True,
        "eval_count": 50,
        "eval_duration": 2_000_000_000,  # 2s in NANOSECONDS
        "total_duration": 3_000_000_000,
        "prompt_eval_count": 20,
    },
)


# ---- stream frames ------------------------------------------------------------


async def test_stream_happy_path_frame_sequence() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=OK_CHUNKS)

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    async with _mock_http(handler) as http:
        frames = _frames([f async for f in stream_infer("hi", http, CFG, sem)])
    types = [f["type"] for f in frames]
    assert types == ["meta", "token", "token", "stats", "done"]
    assert frames[0]["model"] == "qwen-test"
    assert frames[1]["text"] == "Hello"
    assert not sem.locked()  # released exactly once by the generator's finally


async def test_stats_math_nanoseconds_and_prices() -> None:
    chunk = {
        "eval_count": 50,
        "eval_duration": 2_000_000_000,
        "total_duration": 3_000_000_000,
        "prompt_eval_count": 20,
    }
    f = json.loads(_stats_frame(chunk, ttft_ms=120, cfg=CFG)[len("data:"):].strip())
    assert f["tok_per_s"] == 25.0  # 50 / (2e9/1e9)
    assert f["duration_ms"] == 3000  # 3e9 / 1e6
    # 20/1e6*1.0 + 50/1e6*5.0 = 0.00002 + 0.00025
    assert f["api_equiv_usd"] == 0.00027
    assert f["ttft_ms"] == 120


async def test_stats_absent_fields_default_zero() -> None:
    f = json.loads(_stats_frame({"done": True}, ttft_ms=0, cfg=CFG)[len("data:"):].strip())
    assert f["tokens"] == 0 and f["tok_per_s"] == 0.0 and f["api_equiv_usd"] == 0.0


async def test_offline_raises_and_releases_sem_exactly_once() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    async with _mock_http(handler) as http:
        agen = stream_infer("hi", http, CFG, sem)
        with pytest.raises(InferUnavailable):
            await anext(agen)
    # finally ran during the unwind — released once; a second release would make _value 2
    assert not sem.locked()
    assert sem._value == 1  # noqa: SLF001 — the no-double-release invariant IS the test


async def test_non_200_upstream_is_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    async with _mock_http(handler) as http:
        with pytest.raises(InferUnavailable):
            await anext(stream_infer("hi", http, CFG, sem))
    assert sem._value == 1  # noqa: SLF001


async def test_disconnect_after_priming_releases_sem() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=OK_CHUNKS)

    sem = asyncio.Semaphore(1)
    await sem.acquire()
    async with _mock_http(handler) as http:
        agen = stream_infer("hi", http, CFG, sem)
        await anext(agen)  # primed (meta)
        await agen.aclose()  # client vanished before iteration — the started finally MUST run
    assert sem._value == 1  # noqa: SLF001


# ---- the route ------------------------------------------------------------------


@pytest.fixture
def app_client(monkeypatch):
    from app.main import create_app

    async def _true(*a, **k):
        return True

    monkeypatch.setattr("app.turnstile.verify", _true)
    app = create_app()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=OK_CHUNKS)

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    transport = httpx.ASGITransport(app=app)

    def _mk():
        return httpx.AsyncClient(transport=transport, base_url="http://t")

    return app, _mk


async def test_route_streams_sse(app_client) -> None:
    app, mk = app_client
    async with mk() as c:
        r = await c.post("/api/ai/infer", json={"prompt": "hi", "turnstileToken": "x"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    frames = _frames([b for b in r.text.split("\n\n") if b.strip()])
    assert [f["type"] for f in frames] == ["meta", "token", "token", "stats", "done"]
    assert not app.state.infer_sem.locked()


async def test_route_offline_503(app_client, monkeypatch) -> None:
    app, mk = app_client

    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(offline))
    async with mk() as c:
        r = await c.post("/api/ai/infer", json={"prompt": "hi", "turnstileToken": "x"})
    assert r.status_code == 503
    assert r.json()["error"] == "local model offline"
    assert app.state.infer_sem._value == 1  # noqa: SLF001 — released exactly once


async def test_route_busy_503(app_client) -> None:
    app, mk = app_client
    await app.state.infer_sem.acquire()  # hold the single slot
    try:
        async with mk() as c:
            r = await c.post("/api/ai/infer", json={"prompt": "hi", "turnstileToken": "x"})
        assert r.status_code == 503
        assert r.json()["error"] == "local model busy"
    finally:
        app.state.infer_sem.release()


async def test_route_rate_limited_429(app_client) -> None:
    app, mk = app_client
    app.state.infer_limiter.check = lambda ip: (False, 60)
    async with mk() as c:
        r = await c.post("/api/ai/infer", json={"prompt": "hi", "turnstileToken": "x"})
    assert r.status_code == 429


async def test_route_overlong_prompt_422(app_client) -> None:
    app, mk = app_client
    async with mk() as c:
        r = await c.post("/api/ai/infer", json={"prompt": "x" * 501, "turnstileToken": "x"})
    assert r.status_code == 422


async def test_boot_independent_of_ollama() -> None:
    from app.main import create_app

    app = create_app()  # no Ollama anywhere — must not raise
    assert app.state.infer_sem is not None


# ---- QA-round-1 folds ------------------------------------------------------------


async def test_setup_exception_does_not_leak_sem() -> None:
    """A pre-stream failure path other than InferUnavailable: the route acloses; the primed-or-
    unwound generator's finally must still release exactly once."""
    sem = asyncio.Semaphore(1)
    await sem.acquire()

    def handler(request: httpx.Request) -> httpx.Response:
        raise RuntimeError("not an httpx error — escapes the except chain")

    async with _mock_http(handler) as http:
        agen = stream_infer("hi", http, CFG, sem)
        with pytest.raises(RuntimeError):
            await anext(agen)
        await agen.aclose()  # the route's BaseException guard — must be a no-op on release count
    assert sem._value == 1  # noqa: SLF001


async def test_route_turnstile_fail_403(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _false(*a, **k):
        return False

    monkeypatch.setattr("app.routes.infer.turnstile.verify", _false)
    monkeypatch.setattr("app.config.get_settings", lambda: CFG_TURNSTILE)
    monkeypatch.setattr("app.routes.infer.get_settings", lambda: CFG_TURNSTILE)
    async with mk() as c:
        r = await c.post("/api/ai/infer", json={"prompt": "hi", "turnstileToken": "bad"})
    assert r.status_code == 403
    assert app.state.infer_sem._value == 1  # noqa: SLF001 — never acquired


async def test_route_429_carries_retry_after(app_client) -> None:
    app, mk = app_client
    app.state.infer_limiter.check = lambda ip: (False, 42)
    async with mk() as c:
        r = await c.post("/api/ai/infer", json={"prompt": "hi", "turnstileToken": "x"})
    assert r.status_code == 429 and r.headers["Retry-After"] == "42"


async def test_route_happy_path_sem_value_exactly_one(app_client) -> None:
    app, mk = app_client
    async with mk() as c:
        r = await c.post("/api/ai/infer", json={"prompt": "hi", "turnstileToken": "x"})
    assert r.status_code == 200
    assert app.state.infer_sem._value == 1  # noqa: SLF001 — released exactly once, never doubled


def test_prompt_max_matches_config() -> None:
    from app.routes.infer import PROMPT_MAX

    assert CFG.infer_prompt_max == PROMPT_MAX
