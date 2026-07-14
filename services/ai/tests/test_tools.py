
from app import tools
from app.config import Settings


class FakeResp:
    def __init__(self, data, status=200):
        self._data = data
        self.status = status

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError("http error")

    def json(self):
        return self._data


class FakeHTTP:
    def __init__(self, data=None, raises=False):
        self._data = data
        self.raises = raises
        self.urls: list[str] = []

    async def get(self, url, timeout=None):
        self.urls.append(url)
        if self.raises:
            raise RuntimeError("boom")
        return FakeResp(self._data)


CFG = Settings(core_base="https://gipc.dev")


async def test_get_status_trimmed() -> None:
    http = FakeHTTP({"metrics": {"cpuCores": {"value": 0.5}, "p99Ms": {"value": 42}}})
    out = await tools.dispatch("get_status", {}, http, CFG)
    assert out == {"metrics": {"cpuCores": 0.5, "p99Ms": 42}}
    assert http.urls == ["https://gipc.dev/api/status"]  # fixed literal path, no arg interpolation


async def test_get_uptime_trimmed() -> None:
    http = FakeHTTP({"targets": [{"name": "core", "status": "up", "uptimePct": 100, "extra": "x"}]})
    out = await tools.dispatch("get_uptime", {}, http, CFG)
    assert out == {"targets": [{"name": "core", "status": "up", "uptimePct": 100}]}


async def test_get_deploys_capped() -> None:
    http = FakeHTTP([1, 2, 3, 4, 5])
    out = await tools.dispatch("get_deploys", {}, http, CFG)
    assert out == {"deploys": [1, 2, 3]}


async def test_upstream_error_is_dict_not_raise() -> None:
    out = await tools.dispatch("get_status", {}, FakeHTTP(raises=True), CFG)
    assert out == {"error": "upstream unavailable"}


async def test_unknown_tool() -> None:
    out = await tools.dispatch("rm_rf", {}, FakeHTTP(), CFG)
    assert out == {"error": "unknown tool: rm_rf"}


async def test_search_corpus(monkeypatch) -> None:
    async def fake_retrieve(q, k=6):
        assert q == "phd"
        return [{"title": "Education", "url": "/resume", "score": 0.9, "content": "PhD ..." * 100}]

    monkeypatch.setattr(tools, "retrieve", fake_retrieve)
    out = await tools.dispatch("search_corpus", {"query": "phd"}, FakeHTTP(), CFG)
    assert out["results"][0]["title"] == "Education"
    assert len(out["results"][0]["content"]) <= 500


async def test_search_corpus_empty_query() -> None:
    out = await tools.dispatch("search_corpus", {"query": "  "}, FakeHTTP(), CFG)
    assert out == {"error": "empty query"}
