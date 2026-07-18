"""Route tests for POST /api/ai/variant — mirrors test_jd_route.py MINUS the LLM/budget branches.

No Anthropic call ⇒ no `llm is None`/budget gates. CORPUS_DIR points at the repo résumé so the route
loads real facts; a bad CORPUS_DIR must 503 (not 500).
"""

from pathlib import Path

import httpx
import pytest

REPO_RESUME_DIR = Path(__file__).parents[3] / "resume"

BODY = {
    "jdText": "Computer vision engineer, Raspberry Pi edge inference, PyTorch, Kubernetes.",
    "turnstileToken": "x",
}


@pytest.fixture
def app_client(monkeypatch):
    from app.main import create_app

    monkeypatch.setenv("CORPUS_DIR", str(REPO_RESUME_DIR))

    async def _true(*a, **k):
        return True

    monkeypatch.setattr("app.turnstile.verify", _true)
    app = create_app()
    app.state.http = object()
    transport = httpx.ASGITransport(app=app)

    def mk():
        return httpx.AsyncClient(transport=transport, base_url="http://t")

    yield app, mk


async def test_valid_200(app_client) -> None:
    app, mk = app_client
    async with mk() as c:
        r = await c.post("/api/ai/variant", json=BODY)
    assert r.status_code == 200
    body = r.json()
    assert body["factCount"] == 19 and body["ordered"]
    assert all({"id", "kind", "text", "section", "score", "matched"} <= set(f) for f in body["ordered"])


async def test_empty_jd_422(app_client) -> None:
    app, mk = app_client
    async with mk() as c:
        r = await c.post("/api/ai/variant", json={"jdText": "   ", "turnstileToken": "x"})
    assert r.status_code == 422


async def test_over_limit_429(app_client) -> None:
    app, mk = app_client
    from app.limiter import RateLimiter

    app.state.variant_limiter = RateLimiter(0.0001, 2)  # tiny burst for the test
    async with mk() as c:
        codes = [(await c.post("/api/ai/variant", json=BODY)).status_code for _ in range(4)]
    assert 429 in codes


async def test_turnstile_403(app_client, monkeypatch) -> None:
    app, mk = app_client
    from app.config import Settings

    real = Settings(turnstile_secret="0xrealsecret")  # enforced only with a REAL secret
    monkeypatch.setattr("app.routes.variant.get_settings", lambda: real)

    async def _false(*a, **k):
        return False

    monkeypatch.setattr("app.turnstile.verify", _false)
    async with mk() as c:
        r = await c.post("/api/ai/variant", json={**BODY, "turnstileToken": ""})
    assert r.status_code == 403


async def test_turnstile_graceful_with_test_key(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _false(*a, **k):
        return False

    monkeypatch.setattr("app.turnstile.verify", _false)  # default TEST secret → gate skipped
    async with mk() as c:
        r = await c.post("/api/ai/variant", json={**BODY, "turnstileToken": ""})
    assert r.status_code == 200  # NOT 403 — graceful mode


async def test_corpus_missing_503(app_client, monkeypatch) -> None:
    app, mk = app_client
    monkeypatch.setenv("CORPUS_DIR", "/nonexistent/path/does-not-exist")
    async with mk() as c:
        r = await c.post("/api/ai/variant", json=BODY)
    assert r.status_code == 503
