import httpx
import pytest

from app import db
from app.embedder import set_embedder
from app.main import create_app


class FakeEmbedder:
    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 384 for _ in texts]


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows
        self.rowcount = len(rows)

    async def fetchall(self):
        return self._rows


class FakeConn:
    def __init__(self, rows):
        self._rows = rows
        self.queries: list[tuple[str, tuple]] = []

    async def execute(self, sql, params=None):
        self.queries.append((sql, params))
        return FakeCursor(self._rows)

    async def commit(self):
        pass


class FakePool:
    def __init__(self, rows):
        self.conn = FakeConn(rows)

    def connection(self, timeout=None):
        conn = self.conn

        class _Ctx:
            async def __aenter__(self):
                return conn

            async def __aexit__(self, *a):
                return False

        return _Ctx()


@pytest.fixture
def client_with_kb(monkeypatch):
    rows = [("resume", "Skills — Cloud", "/resume", "k8s " * 200, 0.87)]
    fake_pool = FakePool(rows)
    monkeypatch.setattr(db, "pool", lambda: fake_pool)

    async def ready() -> bool:
        return True

    monkeypatch.setattr(db, "kb_ready", ready)
    set_embedder(FakeEmbedder())
    app = create_app()
    yield httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")
    set_embedder(None)


async def test_search_shape_and_snippet_cap(client_with_kb) -> None:
    async with client_with_kb as c:
        r = await c.get("/api/ai/search", params={"q": "kubernetes"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    res = body["results"][0]
    assert set(res) == {"source", "title", "url", "snippet", "score"}
    assert len(res["snippet"]) <= 401  # 400 + ellipsis
    assert res["score"] == 0.87


async def test_search_q_caps() -> None:
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        assert (await c.get("/api/ai/search", params={"q": "x" * 201})).status_code == 422
        assert (await c.get("/api/ai/search", params={"q": "x"})).status_code == 422
        assert (await c.get("/api/ai/search")).status_code == 422


async def test_search_honest_503_when_kb_unavailable() -> None:
    app = create_app()  # no pool/schema in tests → kb_ready False
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/ai/search", params={"q": "kubernetes"})
    assert r.status_code == 503
    assert r.json() == {"error": "knowledge base unavailable"}
