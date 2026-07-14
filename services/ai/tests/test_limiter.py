from types import SimpleNamespace

from app.limiter import MAX_BUCKETS, RateLimiter, client_ip


def _req(headers: dict[str, str] | None = None, peer: str = "10.0.0.1"):
    h = {k.lower(): v for k, v in (headers or {}).items()}
    return SimpleNamespace(
        headers=SimpleNamespace(get=lambda k, d="": h.get(k.lower(), d)),
        client=SimpleNamespace(host=peer),
    )


def test_ip_resolution_precedence() -> None:
    assert client_ip(_req({"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "5.6.7.8"})) == "1.2.3.4"
    assert client_ip(_req({"X-Forwarded-For": "5.6.7.8, 9.9.9.9"})) == "5.6.7.8"
    assert client_ip(_req()) == "10.0.0.1"


def test_burst_then_limited() -> None:
    lim = RateLimiter(rps=1.0, burst=3)
    results = [lim.check("ip-a")[0] for _ in range(4)]
    assert results == [True, True, True, False]
    _, retry = lim.check("ip-a")
    assert retry >= 1


def test_buckets_are_per_ip() -> None:
    lim = RateLimiter(rps=1.0, burst=1)
    assert lim.check("a")[0] is True
    assert lim.check("a")[0] is False
    assert lim.check("b")[0] is True  # different client unaffected


def test_prune_bounds_memory() -> None:
    lim = RateLimiter(rps=1.0, burst=1)
    for i in range(MAX_BUCKETS):
        lim.check(f"ip-{i}")
    lim.check("one-more")  # triggers prune
    assert len(lim._buckets) <= MAX_BUCKETS // 2 + 1
