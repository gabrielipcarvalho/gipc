"""Structured JSON logging to stdout, matching core's field style.

PRIVACY (M3 lesson — these logs are publicly surfaced via Loki → /api/logs): the access log carries
method/path/status/dur_ms ONLY. Never an IP, never message/prompt content, never a key.
"""

import json
import logging
import sys
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

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


class AccessLogMiddleware:
    """Pure-ASGI access log (streaming-safe: never buffers the body, unlike BaseHTTPMiddleware)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":  # lifespan/websocket must pass straight through
            await self.app(scope, receive, send)
            return
        path = scope["path"]
        if path in EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        start = time.monotonic()
        status = 500  # default if http.response.start never arrives (e.g. crash mid-stream)

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            info(
                "request",
                method=scope["method"],
                path=path,
                status=status,
                dur_ms=int((time.monotonic() - start) * 1000),
            )
