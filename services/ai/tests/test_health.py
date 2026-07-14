import httpx
import pytest

from app.main import create_app


@pytest.fixture
async def client():
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_healthz_shape(client) -> None:
    r = await client.get("/api/ai/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] is False  # no DSN in tests → honest False, never an error
    assert body["anthropic_configured"] is False


async def test_readyz_independent(client) -> None:
    r = await client.get("/api/ai/readyz")
    assert r.status_code == 200
    assert r.json() == {"status": "ready"}


async def test_version(client) -> None:
    r = await client.get("/api/ai/version")
    assert r.status_code == 200
    assert r.json()["service"] == "gipc-ai"


async def test_rate_limit_429_and_readyz_exempt() -> None:
    import app.main as main_mod
    from app.config import get_settings

    get_settings.cache_clear()
    app = main_mod.create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        headers = {"CF-Connecting-IP": "203.0.113.7"}
        codes = [(await c.get("/api/ai/version", headers=headers)).status_code for _ in range(15)]
        assert 429 in codes  # burst (10) exhausted → limited
        limited = await c.get("/api/ai/version", headers=headers)
        if limited.status_code == 429:
            assert "retry-after" in {k.lower() for k in limited.headers}
        # readyz stays exempt for the same hammered client
        r = await c.get("/api/ai/readyz", headers=headers)
        assert r.status_code == 200
