"""POST /api/ai/jd — paste-a-JD evidence mapping (JSON, one-shot, NOT streamed).

Guard order mirrors the oracle (all before any model cost): no-llm → strict per-IP (3/hour) → Turnstile →
daily budget. No concurrency semaphore (one-shot; the 3/hour + $2/day breaker are the pile-up backstop).
"""

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import budget, db, turnstile
from ..config import get_settings
from ..jd import analyze_jd
from ..limiter import client_ip
from ..llm import get_llm

router = APIRouter()

JD_MAX = 8000


class JdRequest(BaseModel):
    jdText: str = Field(min_length=1, max_length=JD_MAX)
    turnstileToken: str = ""


@router.post("/api/ai/jd")
async def jd(req: JdRequest, request: Request) -> object:
    cfg = get_settings()
    llm = get_llm()
    if llm is None:
        return JSONResponse({"error": "oracle not configured"}, status_code=503)

    text = req.jdText.strip()
    if not text:
        return JSONResponse({"error": "empty job description"}, status_code=422)

    ip = client_ip(request)
    allowed, retry = request.app.state.jd_limiter.check(ip)
    if not allowed:
        return JSONResponse(
            {"error": "rate limited"}, status_code=429, headers={"Retry-After": str(retry)}
        )

    if cfg.turnstile_enabled and not await turnstile.verify(
        req.turnstileToken, ip, request.app.state.http
    ):
        return JSONResponse({"error": "turnstile"}, status_code=403)

    pool = db.pool()
    rem = await budget.budget_remaining(pool, cfg)
    if rem is None:
        return JSONResponse({"error": "the oracle is temporarily unavailable"}, status_code=503)
    if rem <= 0:
        return JSONResponse({"error": "the oracle rests — daily budget spent"}, status_code=503)

    analysis, tin, tout = await analyze_jd(text, llm, cfg)
    cost = budget.est_cost(tin, tout, cfg)
    # shielded so a cancellation after the billed call still records spend + audit (parity with oracle)
    await asyncio.shield(_meter(pool, ip, len(text), tin, tout, cost, cfg))

    if analysis is None:
        return JSONResponse({"error": "couldn't analyze that JD — try again"}, status_code=503)
    return analysis.model_dump()


async def _meter(pool, ip: str, jd_len: int, tin: int, tout: int, cost: float, cfg) -> None:
    await budget.add_spend(pool, cost)
    await budget.write_audit(pool, budget.ip_hash(ip, cfg), jd_len, ["jd"], tin, tout, cost)
