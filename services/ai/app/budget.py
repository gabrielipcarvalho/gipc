"""Persisted daily cost breaker + privacy-first audit.

The breaker is checked BEFORE any model call and is FAIL-CLOSED: an unknown budget (DB error) → 503, never
spend. The day key is the postgres server date (CURRENT_DATE, UTC container) — no Python clock. The audit
stores a salted IP hash + lengths/costs ONLY — never message or prompt content.
"""

import hashlib

from psycopg_pool import AsyncConnectionPool

from .config import Settings
from .log import error


def est_cost(tokens_in: int, tokens_out: int, cfg: Settings) -> float:
    return tokens_in * cfg.price_in_per_mtok / 1e6 + tokens_out * cfg.price_out_per_mtok / 1e6


def ip_hash(ip: str, cfg: Settings) -> str:
    salt = cfg.audit_salt.get_secret_value()
    return hashlib.sha256((salt + ip).encode()).hexdigest()[:16]


async def budget_remaining(pool: AsyncConnectionPool | None, cfg: Settings) -> float | None:
    """USD left in today's budget. None ONLY on a real DB error (caller fails closed). An empty result
    (no spend row yet today) means spend=0 → full budget, NOT None (else the first request each UTC day
    would self-lock-out and the row would never be created)."""
    if pool is None:
        return None
    try:
        async with pool.connection(timeout=2) as conn:
            cur = await conn.execute("SELECT usd FROM oracle_spend WHERE day = CURRENT_DATE")
            row = await cur.fetchone()
        spent = float(row[0]) if row else 0.0
        return cfg.daily_budget_usd - spent
    except Exception as e:
        error("budget check failed (fail-closed)", kind=type(e).__name__)
        return None


async def add_spend(pool: AsyncConnectionPool | None, usd: float) -> None:
    if pool is None or usd <= 0:
        return
    try:
        async with pool.connection(timeout=2) as conn:
            await conn.execute(
                """INSERT INTO oracle_spend (day, usd) VALUES (CURRENT_DATE, %s)
                   ON CONFLICT (day) DO UPDATE SET usd = oracle_spend.usd + EXCLUDED.usd""",
                (usd,),
            )
            await conn.commit()
    except Exception as e:
        error("add_spend failed", kind=type(e).__name__)


async def write_audit(
    pool: AsyncConnectionPool | None,
    ip_h: str,
    msg_len: int,
    tools_used: list[str],
    tokens_in: int,
    tokens_out: int,
    cost: float,
) -> None:
    if pool is None:
        return
    try:
        async with pool.connection(timeout=2) as conn:
            await conn.execute(
                """INSERT INTO oracle_audit
                   (ip_hash, msg_len, tools_used, tokens_in, tokens_out, est_cost)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (ip_h, msg_len, tools_used, tokens_in, tokens_out, cost),
            )
            await conn.commit()
    except Exception as e:
        error("write_audit failed", kind=type(e).__name__)
