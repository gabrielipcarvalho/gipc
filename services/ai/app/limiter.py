"""Per-client-IP token bucket, mirroring services/core's semantics.

IP resolution: CF-Connecting-IP (Cloudflare-injected, survives cloudflared→Caddy) → first
X-Forwarded-For → peer. Spoofable only off the Cloudflare path — same accepted trust model as core.
Only the kubelet probe path (readyz) is exempt; healthz/version/everything else is limited.
Memory is bounded: stale buckets are pruned once the map exceeds MAX_BUCKETS.
"""

import time
from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from .log import EXEMPT_PATHS

MAX_BUCKETS = 10_000


def client_ip(request: Request) -> str:
    cf = request.headers.get("cf-connecting-ip", "").strip()
    if cf:
        return cf
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    def __init__(self, rps: float, burst: int) -> None:
        self.rps = rps
        self.burst = float(burst)
        # ip -> [tokens, last_refill_monotonic]
        self._buckets: dict[str, list[float]] = {}

    def check(self, ip: str) -> tuple[bool, int]:
        """Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        bucket = self._buckets.get(ip)
        if bucket is None:
            if len(self._buckets) >= MAX_BUCKETS:
                self._prune(now)
            bucket = [self.burst, now]
            self._buckets[ip] = bucket
        tokens, last = bucket
        tokens = min(self.burst, tokens + (now - last) * self.rps)
        if tokens >= 1.0:
            bucket[0] = tokens - 1.0
            bucket[1] = now
            return True, 0
        bucket[0] = tokens
        bucket[1] = now
        retry = max(1, int((1.0 - tokens) / self.rps))
        return False, retry

    def _prune(self, now: float) -> None:
        """Drop the oldest half by last-refill time — keeps the map bounded without a sweeper thread."""
        by_age = sorted(self._buckets.items(), key=lambda kv: kv[1][1])
        for ip, _ in by_age[: len(by_age) // 2]:
            del self._buckets[ip]


def rate_limit_middleware(limiter: RateLimiter):
    async def middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)
        allowed, retry = limiter.check(client_ip(request))
        if not allowed:
            return JSONResponse(
                {"error": "rate limited"}, status_code=429, headers={"Retry-After": str(retry)}
            )
        return await call_next(request)

    return middleware
