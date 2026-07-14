"""App factory. Runtime middleware order (outermost first): access-log → CORS → rate limiter → routes.

Starlette runs the LAST-added middleware first, so registration below is in reverse.
Lifespan: open the DB pool (non-blocking), best-effort schema, warm the local embedder. Boot never
depends on the DB; the embedder is a baked local artifact so its load is allowed to gate startup.
"""

import asyncio
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from . import db
from .config import get_settings
from .limiter import RateLimiter, RateLimitMiddleware
from .llm import get_llm
from .log import AccessLogMiddleware, configure_logging, info
from .routes import health, oracle, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=5)
    await db.open_pool()
    await db.ensure_schema()  # best-effort — failure is logged and retried lazily on first search
    get_llm()  # build the Anthropic client if a key is configured (cheap, no network); else stays None
    if os.environ.get("SKIP_EMBEDDER_WARMUP") != "1":  # tests/dev without the baked model
        try:
            from .embedder import get_embedder

            get_embedder()  # warm the local ONNX model (baked into the image; offline)
        except Exception as e:
            info("embedder warmup failed — search degrades honestly", kind=type(e).__name__)
    yield
    await app.state.http.aclose()
    await db.close_pool()


def create_app() -> FastAPI:
    configure_logging()
    cfg = get_settings()
    app = FastAPI(title="gipc-ai", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    # oracle concurrency cap + strict per-IP limiter — on app.state (no module-level shared state)
    app.state.oracle_sem = asyncio.Semaphore(cfg.max_streams)
    app.state.oracle_limiter = RateLimiter(cfg.oracle_rate_per_10min / 600.0, cfg.oracle_rate_per_10min)

    limiter = RateLimiter(cfg.rate_limit_rps, cfg.rate_limit_burst)
    app.add_middleware(RateLimitMiddleware, limiter=limiter)  # innermost
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[cfg.cors_origin],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.add_middleware(AccessLogMiddleware)  # outermost

    app.include_router(health.router)
    app.include_router(search.router)
    app.include_router(oracle.router)
    info("gipc-ai configured", anthropic_configured=cfg.anthropic_configured)
    return app


app = create_app()
