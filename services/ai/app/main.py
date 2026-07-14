"""App factory. Runtime middleware order (outermost first): access-log → CORS → rate limiter → routes.

Starlette runs the LAST-added middleware first, so registration below is in reverse.
"""

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from .config import get_settings
from .limiter import RateLimiter, rate_limit_middleware
from .log import access_log_middleware, configure_logging, info
from .routes import health


def create_app() -> FastAPI:
    configure_logging()
    cfg = get_settings()
    app = FastAPI(title="gipc-ai", docs_url=None, redoc_url=None, openapi_url=None)

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
    info("gipc-ai configured", anthropic_configured=cfg.anthropic_configured)
    return app


app = create_app()
