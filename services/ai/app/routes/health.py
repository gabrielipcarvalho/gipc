"""Health endpoints.

readyz is dependency-INDEPENDENT (M3 lesson: single replica behind Caddy — gating readiness on a dep
would 502 every /api/ai/* on a blip) and is what kubelet probes (readiness AND liveness).
healthz is the public diagnostic: db reachability (TTL-cached) + whether the oracle is configured.
"""

import os

from fastapi import APIRouter

from ..config import get_settings
from ..db import db_ok

router = APIRouter()


@router.get("/api/ai/healthz")
async def healthz() -> dict[str, object]:
    return {
        "status": "ok",
        "db": await db_ok(),
        "anthropic_configured": get_settings().anthropic_configured,
    }


@router.get("/api/ai/readyz")
async def readyz() -> dict[str, str]:
    return {"status": "ready"}


@router.get("/api/ai/version")
async def version() -> dict[str, str]:
    return {"service": "gipc-ai", "version": os.environ.get("GIT_SHA", "dev")}
