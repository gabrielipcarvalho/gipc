"""DB layer: async pool + best-effort schema + health ping.

Boot is NEVER DB-dependent (M3 lesson: a postgres blip must not 502 the /api/ai/* surface):
- the pool opens with wait=False (non-blocking),
- ensure_schema() is best-effort at startup (caught + logged) and retried lazily on first use,
- readyz stays independent; /api/ai/search returns an honest 503 while the KB is unavailable.
The health ping is TTL-cached with a single-flight lock (public healthz must not amplify to postgres).
"""

import asyncio
import time

from psycopg_pool import AsyncConnectionPool

from .config import get_settings
from .log import error, info

_TTL_SECONDS = 10.0
_cache: tuple[float, bool] | None = None  # (checked_at_monotonic, ok)
_lock = asyncio.Lock()

_pool: AsyncConnectionPool | None = None
_schema_ready = False
_schema_lock: asyncio.Lock | None = None

DDL = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS chunks (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,
  title        text NOT NULL,
  url          text NOT NULL,
  content      text NOT NULL,
  content_hash text NOT NULL UNIQUE,
  embedding    vector(384) NOT NULL,
  meta         jsonb NOT NULL DEFAULT '{}'
);
"""
ADVISORY_LOCK_KEY = 74201  # service + ingest Job may run DDL concurrently — serialize it


async def open_pool() -> None:
    global _pool
    dsn = get_settings().database_url.get_secret_value()
    if not dsn:
        info("db pool skipped — no DATABASE_URL (degraded mode)")
        return
    _pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False)
    await _pool.open(wait=False)  # non-blocking: boot must not depend on the DB


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> AsyncConnectionPool | None:
    return _pool


async def ensure_schema() -> bool:
    """Idempotent DDL under an advisory lock. Best-effort: returns False (logged) on failure."""
    global _schema_ready, _schema_lock
    if _schema_ready:
        return True
    if _pool is None:
        return False
    if _schema_lock is None:
        _schema_lock = asyncio.Lock()
    async with _schema_lock:
        if _schema_ready:
            return True
        try:
            async with _pool.connection(timeout=2) as conn:
                # autocommit so a DDL error can't abort the tx and strand the unlock (else the
                # session-level advisory lock leaks on a pooled conn and wedges later callers).
                # Restore it before returning the conn — the pool has no reset callback, so a
                # left-on autocommit would silently break ingest's single-transaction atomicity.
                await conn.set_autocommit(True)
                try:
                    await conn.execute("SELECT pg_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
                    try:
                        await conn.execute(DDL)
                    finally:
                        await conn.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
                finally:
                    await conn.set_autocommit(False)
            _schema_ready = True
            info("schema ready")
            return True
        except Exception as e:
            error("ensure_schema failed (will retry lazily)", kind=type(e).__name__)
            return False


async def kb_ready() -> bool:
    """True when the pool exists and the schema is (or becomes) ready — the search-serving gate."""
    return _pool is not None and await ensure_schema()


async def db_ok() -> bool:
    global _cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < _TTL_SECONDS:
        return _cache[1]
    async with _lock:
        now = time.monotonic()
        if _cache is not None and now - _cache[0] < _TTL_SECONDS:
            return _cache[1]
        ok = await _ping()
        _cache = (time.monotonic(), ok)
        return ok


async def _ping() -> bool:
    if _pool is None:
        return False
    try:
        # wait_for bounds the WHOLE ping — a wedged-but-accepting postgres must not hang healthz
        return await asyncio.wait_for(_select_one(), timeout=3.0)
    except Exception:
        return False


async def _select_one() -> bool:
    assert _pool is not None
    async with _pool.connection(timeout=2) as conn:
        await conn.execute("SELECT 1")
    return True
