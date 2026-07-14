"""POST /api/ai/oracle — SSE oracle agent endpoint.

Guard order (ALL before any model cost): no-llm → strict per-IP limit → Turnstile → daily budget →
concurrency cap. The concurrency Semaphore + strict RateLimiter live on app.state (built in create_app),
never module-level (no cross-instance state leak). The slot is released exactly once in the generator's
finally — freed even on client disconnect now that the middleware is pure-ASGI.
"""

from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .. import db, turnstile
from ..budget import budget_remaining
from ..config import get_settings
from ..limiter import client_ip
from ..llm import get_llm
from ..oracle import run_oracle

router = APIRouter()

MSG_MAX = 2000
CTX_MAX = 1000
CONTENT_MAX = 2000
HISTORY_MAX = 12


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=CONTENT_MAX)


class OracleRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MSG_MAX)
    history: list[Turn] = Field(default_factory=list, max_length=HISTORY_MAX)
    context: str | None = Field(default=None, max_length=CTX_MAX)
    turnstileToken: str = ""


@router.post("/api/ai/oracle")
async def oracle(req: OracleRequest, request: Request) -> object:
    cfg = get_settings()
    llm = get_llm()
    if llm is None:
        return JSONResponse({"error": "oracle not configured"}, status_code=503)

    ip = client_ip(request)
    allowed, retry = request.app.state.oracle_limiter.check(ip)
    if not allowed:
        return JSONResponse(
            {"error": "rate limited"}, status_code=429, headers={"Retry-After": str(retry)}
        )

    http = request.app.state.http
    if cfg.turnstile_enabled and not await turnstile.verify(req.turnstileToken, ip, http):
        return JSONResponse({"error": "turnstile"}, status_code=403)

    pool = db.pool()
    rem = await budget_remaining(pool, cfg)
    if rem is None:  # DB down / unknown budget → fail closed, but honestly (not "budget spent")
        return JSONResponse({"error": "the oracle is temporarily unavailable"}, status_code=503)
    if rem <= 0:
        return JSONResponse({"error": "the oracle rests — daily budget spent"}, status_code=503)

    sem = request.app.state.oracle_sem
    if sem.locked():
        return JSONResponse({"error": "the oracle is busy"}, status_code=503)
    await sem.acquire()  # no await between locked() and acquire → race-free in single-thread asyncio

    async def _gen():
        try:
            async for f in run_oracle(req, ip, pool, http, llm, cfg):
                yield f
        finally:
            sem.release()  # exactly once; runs on normal end, error, and disconnect

    try:
        return StreamingResponse(
            _gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception:  # ctor failing before _gen is ever iterated would otherwise leak the slot
        sem.release()
        raise
