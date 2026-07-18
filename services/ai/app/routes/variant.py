"""POST /api/ai/variant — deterministic JD-tailored résumé reorder (NO LLM, zero-fabrication).

A SELECT + REORDER over the sanitized résumé facts (`variant.tailor`). No Anthropic call ⇒ NO budget to
meter ⇒ the endpoint keeps working even when the oracle is unconfigured / over-budget (the decoupling
win). Guards mirror the JD analyzer MINUS the budget breaker: strict per-IP limiter → Turnstile (only
when a real secret is set). Corpus-load failure is 503-not-500 (parity with the analyzer).
"""

import os
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import turnstile
from ..config import get_settings
from ..limiter import client_ip
from ..log import error
from ..resume_evidence import load_resume_evidence
from ..variant import tailor

router = APIRouter()

JD_MAX = 8000


class VariantRequest(BaseModel):
    jdText: str = Field(min_length=1, max_length=JD_MAX)
    turnstileToken: str = ""


def _corpus_dir() -> Path:
    return Path(os.environ.get("CORPUS_DIR", "/app/corpus"))


@router.post("/api/ai/variant")
async def variant(req: VariantRequest, request: Request) -> object:
    cfg = get_settings()

    # pydantic min_length=1 passes whitespace-only "   " → strip + explicit 422 (mirrors the analyzer)
    text = req.jdText.strip()
    if not text:
        return JSONResponse({"error": "empty job description"}, status_code=422)

    ip = client_ip(request)
    allowed, retry = request.app.state.variant_limiter.check(ip)
    if not allowed:
        return JSONResponse(
            {"error": "rate limited"}, status_code=429, headers={"Retry-After": str(retry)}
        )

    if cfg.turnstile_enabled and not await turnstile.verify(
        req.turnstileToken, ip, request.app.state.http
    ):
        return JSONResponse({"error": "turnstile"}, status_code=403)

    try:
        resume = load_resume_evidence(_corpus_dir())
        result = tailor(text, resume)
    except Exception as e:  # corrupt/missing corpus OR a bad résumé structure → 503, never a 500
        error("variant: build failed", kind=type(e).__name__)
        return JSONResponse({"error": "résumé temporarily unavailable"}, status_code=503)

    return result.model_dump()
