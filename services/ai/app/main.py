"""App factory. Runtime middleware order (outermost first): access-log → CORS → rate limiter → routes.

Starlette runs the LAST-added middleware first, so registration below is in reverse.
Lifespan: open the DB pool (non-blocking), best-effort schema, warm the local embedder. Boot never
depends on the DB; the embedder is a baked local artifact so its load is allowed to gate startup.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from . import db
from .config import get_settings
from .limiter import RateLimiter, rate_limit_middleware
from .log import access_log_middleware, configure_logging, info
from .routes import health, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open_pool()
    await db.ensure_schema()  # best-effort — failure is logged and retried lazily on first search
    if os.environ.get("SKIP_EMBEDDER_WARMUP") != "1":  # tests/dev without the baked model
        try:
            from .embedder import get_embedder

            get_embedder()  # warm the local ONNX model (baked into the image; offline)
        except Exception as e:
            info("embedder warmup failed — search degrades honestly", kind=type(e).__name__)
    yield
    await db.close_pool()


def create_app() -> FastAPI:
    configure_logging()
    cfg = get_settings()
    app = FastAPI(title="gipc-ai", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    limiter = RateLimiter(cfg.rate_limit_rps, cfg.rate_limit_burst)
    app.add_middleware(BaseHTTPMiddleware, dispatch=rate_limit_middleware(limiter))  # innermost
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[cfg.cors_origin],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.add_middleware(BaseHTTPMiddleware, dispatch=access_log_middleware)  # outermost

    app.include_router(health.router)
    app.include_router(search.router)
    info("gipc-ai configured", anthropic_configured=cfg.anthropic_configured)
    return app


app = create_app()
