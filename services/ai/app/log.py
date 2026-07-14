"""Structured JSON logging to stdout, matching core's field style.

PRIVACY (M3 lesson — these logs are publicly surfaced via Loki → /api/logs): the access log carries
method/path/status/dur_ms ONLY. Never an IP, never message/prompt content, never a key.
"""

import json
import logging
import sys
import time
from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

EXEMPT_PATHS = {"/api/ai/readyz"}  # kubelet probe — no access-log noise (and limiter-exempt)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, object] = {"level": record.levelname, "msg": record.getMessage()}
        extra = getattr(record, "fields", None)
        if isinstance(extra, dict):
            out.update(extra)
        return json.dumps(out, separators=(",", ":"))


def configure_logging() -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    # uvicorn's own access log is redundant with ours (and logs client addr) — silence it
    logging.getLogger("uvicorn.access").disabled = True
    return logging.getLogger("gipc-ai")


log = logging.getLogger("gipc-ai")


def info(msg: str, **fields: object) -> None:
    log.info(msg, extra={"fields": fields})


def error(msg: str, **fields: object) -> None:
    log.error(msg, extra={"fields": fields})


async def access_log_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    if request.url.path in EXEMPT_PATHS:
        return await call_next(request)
    start = time.monotonic()
    response = await call_next(request)
    info(
        "request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        dur_ms=int((time.monotonic() - start) * 1000),
    )
    return response
