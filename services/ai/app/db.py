"""DB health ping — per-connect for P2 (the pool arrives with real load in P3).

The result is TTL-cached with a single-flight lock: healthz is PUBLIC, and without the cache every
anonymous hit would open a fresh TCP connection + postgres backend fork (DB amplification against the
shared store). With it, DB connects are bounded regardless of traffic.
"""

import asyncio
import time

import psycopg

from .config import get_settings

_TTL_SECONDS = 10.0
_cache: tuple[float, bool] | None = None  # (checked_at_monotonic, ok)
_lock = asyncio.Lock()


async def db_ok() -> bool:
    global _cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < _TTL_SECONDS:
        return _cache[1]
    async with _lock:
        # re-check under the lock — another coroutine may have refreshed while we waited
        now = time.monotonic()
        if _cache is not None and now - _cache[0] < _TTL_SECONDS:
            return _cache[1]
        ok = await _ping()
        _cache = (time.monotonic(), ok)
        return ok


async def _ping() -> bool:
    dsn = get_settings().database_url.get_secret_value()
    if not dsn:
        return False
    try:
        async with await psycopg.AsyncConnection.connect(dsn, connect_timeout=2) as conn:
            await conn.execute("SELECT 1")
        return True
    except Exception:
        return False
