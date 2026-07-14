"""Cloudflare Turnstile server-side verification. FAIL-CLOSED: any error/timeout/empty token → False
(never bypass). Runs BEFORE any model cost is incurred."""

import httpx

from .config import get_settings

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify(token: str, ip: str, http: httpx.AsyncClient) -> bool:
    if not token:
        return False  # short-circuit — no network call for a missing token
    secret = get_settings().turnstile_secret.get_secret_value()
    try:
        r = await http.post(
            SITEVERIFY_URL,
            data={"secret": secret, "response": token, "remoteip": ip},
            timeout=5,
        )
        return bool(r.json().get("success", False))
    except Exception:
        return False  # CF outage / timeout / bad JSON → fail closed
