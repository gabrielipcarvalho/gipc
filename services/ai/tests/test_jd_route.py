
import httpx
import pytest

from app.jd import JdAnalysis
from app.llm import set_llm

VALID = {
    "requirements": [{"requirement": "k8s", "evidence": ["k3s"], "strength": "strong"}],
    "pitch": "Runs a self-hosted platform.",
    "gaps": [],
}


class DummyLLM:
    async def create(self, **kw):
        raise NotImplementedError  # route calls analyze_jd, which we monkeypatch

    def stream(self, **kw):
        raise NotImplementedError


@pytest.fixture
def app_client(monkeypatch):
    from app.main import create_app

    async def _true(*a, **k):
        return True

    async def _budget_ok(*a, **k):
        return 5.0

    async def _analyze_ok(text, llm, cfg):
        return JdAnalysis.model_validate(VALID), 500, 200

    monkeypatch.setattr("app.turnstile.verify", _true)
    monkeypatch.setattr("app.routes.jd.budget.budget_remaining", _budget_ok)
    monkeypatch.setattr("app.routes.jd.analyze_jd", _analyze_ok)
    app = create_app()
    app.state.http = object()
    transport = httpx.ASGITransport(app=app)

    def mk():
        return httpx.AsyncClient(transport=transport, base_url="http://t")

    yield app, mk
    set_llm(None)


BODY = {"jdText": "Senior platform engineer: kubernetes, CI/CD, IaC.", "turnstileToken": "x"}


async def test_no_key_503(app_client) -> None:
    app, mk = app_client
    set_llm(None)
    async with mk() as c:
        r = await c.post("/api/ai/jd", json=BODY)
    assert r.status_code == 503 and r.json()["error"] == "oracle not configured"


async def test_valid_200(app_client) -> None:
    app, mk = app_client
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/jd", json=BODY)
    assert r.status_code == 200
    body = r.json()
    assert body["requirements"][0]["strength"] == "strong"
    assert body["pitch"] and "gaps" in body


async def test_turnstile_403(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _false(*a, **k):
        return False

    monkeypatch.setattr("app.turnstile.verify", _false)
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/jd", json={**BODY, "turnstileToken": ""})
    assert r.status_code == 403


async def test_over_limit_429(app_client) -> None:
    app, mk = app_client
    set_llm(DummyLLM())
    async with mk() as c:
        codes = [(await c.post("/api/ai/jd", json=BODY)).status_code for _ in range(6)]
    assert 429 in codes  # 3/hour burst exhausted


async def test_budget_out_503(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _spent(*a, **k):
        return 0.0

    monkeypatch.setattr("app.routes.jd.budget.budget_remaining", _spent)
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/jd", json=BODY)
    assert r.status_code == 503 and "budget" in r.json()["error"]


async def test_analysis_none_503(app_client, monkeypatch) -> None:
    app, mk = app_client

    async def _fail(text, llm, cfg):
        return None, 500, 100

    monkeypatch.setattr("app.routes.jd.analyze_jd", _fail)
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/jd", json=BODY)
    assert r.status_code == 503 and "couldn't analyze" in r.json()["error"]


async def test_empty_jd_422(app_client) -> None:
    app, mk = app_client
    set_llm(DummyLLM())
    async with mk() as c:
        r = await c.post("/api/ai/jd", json={"jdText": "   ", "turnstileToken": "x"})
    assert r.status_code == 422
