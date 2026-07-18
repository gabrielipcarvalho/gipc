"""POST /api/ai/theme — mood → a validated, WCAG-clamped palette (LLM, budget-gated).

Guard chain mirrors the JD analyzer (this DOES call the LLM → keep the budget breaker): no-llm → per-IP
limiter → Turnstile → daily budget → generate → meter. The response is a server-derived allowlist of the 11
known token names mapped to validated colour values — no arbitrary CSS reaches the client.
"""

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import budget, db, turnstile
from ..config import get_settings
from ..limiter import client_ip
from ..llm import get_llm
from ..theme import generate_palette

router = APIRouter()

MOOD_MAX = 200


class ThemeRequest(BaseModel):
    mood: str = Field(min_length=1, max_length=MOOD_MAX)
    turnstileToken: str = ""


@router.post("/api/ai/theme")
async def theme(req: ThemeRequest, request: Request) -> object:
    cfg = get_settings()
    llm = get_llm()
    if llm is None:
        return JSONResponse({"error": "oracle not configured"}, status_code=503)

    mood = req.mood.strip()
    if not mood:
        return JSONResponse({"error": "empty mood"}, status_code=422)

    ip = client_ip(request)
    allowed, retry = request.app.state.theme_limiter.check(ip)
    if not allowed:
        return JSONResponse({"error": "rate limited"}, status_code=429, headers={"Retry-After": str(retry)})

    if cfg.turnstile_enabled and not await turnstile.verify(req.turnstileToken, ip, request.app.state.http):
        return JSONResponse({"error": "turnstile"}, status_code=403)

    pool = db.pool()
    rem = await budget.budget_remaining(pool, cfg)
    if rem is None:
        return JSONResponse({"error": "the oracle is temporarily unavailable"}, status_code=503)
    if rem <= 0:
        return JSONResponse({"error": "the oracle rests — daily budget spent"}, status_code=503)

    palette, tin, tout = await generate_palette(mood, llm, cfg)
    cost = budget.est_cost(tin, tout, cfg)
    await asyncio.shield(_meter(pool, ip, len(mood), tin, tout, cost, cfg))

    if palette is None:
        return JSONResponse({"error": "couldn't read that mood — try again"}, status_code=503)
    return palette


async def _meter(pool, ip: str, mood_len: int, tin: int, tout: int, cost: float, cfg) -> None:
    await budget.add_spend(pool, cost)
    await budget.write_audit(pool, budget.ip_hash(ip, cfg), mood_len, ["theme"], tin, tout, cost)
