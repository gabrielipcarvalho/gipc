"""Route tests for POST /api/ai/theme — mirrors test_jd_route.py (LLM + shared budget breaker)."""

import httpx
import pytest

from app.llm import set_llm


class DummyLLM:
    async def create(self, **kw):
        raise NotImplementedError  # the route calls generate_palette, which we monkeypatch

    def stream(self, **kw):
        raise NotImplementedError


@pytest.fixture
def app_client(monkeypatch):
    from app.main import create_app

    async def _true(*a, **k):
        return True

    async def _budget_ok(*a, **k):
        return 5.0

    async def _gen_ok(mood, llm, cfg):
        return {"--violet": "#b18cff"}, 100, 50

    monkeypatch.setattr("app.turnstile.verify", _true)
    monkeypatch.setattr("app.routes.theme.budget.budget_remaining", _budget_ok)
    monkeypatch.setattr("app.routes.theme.generate_palette", _gen_ok)
    app = create_app()
    app.state.http = object()
    transport = httpx.ASGITransport(app=app)

    def mk():
        return httpx.AsyncClient(transport=transport, base_url="http://t")

    yield app, mk
    set_llm(None)


BODY = {"mood": "autumnal dusk over a quiet sea", "turnstileToken": "x"}


async def test_no_key_503(app_client) -> None:
    app, mk = app_client
    set_llm(None)
    async with mk() as c:
        r = await c.post("/api/ai/theme", json=BODY)
    assert r.status_code == 503 and r.json()["error"] == "oracle not configured"


async def test_valid_200(app_client) -> None:
    app, mk = app_client
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/theme", json=BODY)
    assert r.status_code == 200 and r.json()["--violet"] == "#b18cff"


async def test_empty_mood_422(app_client) -> None:
    app, mk = app_client
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/theme", json={"mood": "   ", "turnstileToken": "x"})
    assert r.status_code == 422


async def test_turnstile_403(app_client, monkeypatch) -> None:
    app, mk = app_client
    from app.config import Settings

    real = Settings(turnstile_secret="0xrealsecret")
    monkeypatch.setattr("app.routes.theme.get_settings", lambda: real)

    async def _false(*a, **k):
        return False

    monkeypatch.setattr("app.turnstile.verify", _false)
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/theme", json={**BODY, "turnstileToken": ""})
    assert r.status_code == 403


async def test_graceful_test_key_200(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _false(*a, **k):
        return False

    monkeypatch.setattr("app.turnstile.verify", _false)  # default TEST secret → gate skipped
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/theme", json={**BODY, "turnstileToken": ""})
    assert r.status_code == 200


async def test_over_limit_429(app_client) -> None:
    app, mk = app_client
    set_llm(DummyLLM())
    async with mk() as c:
        codes = [(await c.post("/api/ai/theme", json=BODY)).status_code for _ in range(10)]
    assert 429 in codes  # 8/10min burst exhausted


async def test_budget_out_503(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _spent(*a, **k):
        return 0.0

    monkeypatch.setattr("app.routes.theme.budget.budget_remaining", _spent)
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/theme", json=BODY)
    assert r.status_code == 503 and "budget" in r.json()["error"]


async def test_generate_none_503(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _fail(mood, llm, cfg):
        return None, 100, 20

    monkeypatch.setattr("app.routes.theme.generate_palette", _fail)
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/theme", json=BODY)
    assert r.status_code == 503 and "couldn't read that mood" in r.json()["error"]
