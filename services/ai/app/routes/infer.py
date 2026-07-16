"""POST /api/ai/infer — the self-hosted live-inference demo endpoint.

Guard order mirrors the oracle: strict per-IP limiter → Turnstile → Semaphore(1). No Anthropic
budget check — this endpoint never spends; the limiter + single slot + 256-token cap ARE the abuse
caps. Ollama down → honest 503 ("local model offline") via generator PRIMING: the first upstream
chunk is awaited BEFORE StreamingResponse, so failure happens while a JSON status is still
possible. The primed generator owns the semaphore release (see app/infer.py) — this route acquires
but NEVER releases.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .. import turnstile
from ..config import get_settings
from ..infer import InferUnavailable, stream_infer
from ..limiter import client_ip

router = APIRouter()

PROMPT_MAX = 500  # pydantic Field needs a literal; a test pins parity with cfg.infer_prompt_max


class InferRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=PROMPT_MAX)
    turnstileToken: str | None = None


@router.post("/api/ai/infer")
async def infer(req: InferRequest, request: Request) -> object:
    cfg = get_settings()
    ip = client_ip(request)

    allowed, retry = request.app.state.infer_limiter.check(ip)
    if not allowed:
        return JSONResponse(
            {"error": "rate limited"}, status_code=429, headers={"Retry-After": str(retry)}
        )

    http = request.app.state.http
    if cfg.turnstile_enabled and not await turnstile.verify(req.turnstileToken, ip, http):
        return JSONResponse({"error": "turnstile"}, status_code=403)

    sem = request.app.state.infer_sem
    if sem.locked():
        return JSONResponse({"error": "local model busy"}, status_code=503)
    await sem.acquire()  # no await between locked() and acquire — race-free in single-thread asyncio

    agen = stream_infer(req.prompt, http, cfg, sem)
    try:
        first = await anext(agen)  # priming: connect + first frame BEFORE headers are committed
    except InferUnavailable:
        # the exception unwound the generator — its finally already released the sem; do NOT release
        return JSONResponse({"error": "local model offline"}, status_code=503)
    except BaseException:
        await agen.aclose()  # deterministic finally (release) for any non-InferUnavailable failure
        raise

    async def _chained():
        # carries NO release logic — the primed inner generator's finally is the sole owner
        yield first
        async for f in agen:
            yield f

    try:
        return StreamingResponse(
            _chained(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )
    except BaseException:
        await agen.aclose()  # ctor failure post-priming — run the primed finally deterministically
        raise
