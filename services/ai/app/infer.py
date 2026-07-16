"""Self-hosted inference streaming — the Ollama client behind /api/ai/infer.

Streams real tokens from the in-cluster Ollama (`/api/generate`, NDJSON) as SSE frames:
meta(model) → token* → stats → done. Stats are REAL: TTFT measured here, tok/s from Ollama's own
eval counters (nanoseconds — converted), the cost line computed from actual token counts at the
configured API rates. Ollama unreachable BEFORE the first frame → InferUnavailable (the route 503s
pre-headers via generator priming); failure mid-stream → an honest error frame, never fake tokens.

Concurrency contract: this generator is the SEM'S SOLE OWNER — the semaphore passed in is released
in the try/finally that is the FIRST statement of the body (nothing precedes it: a pre-try raise
would exit anext() with the finally never entered → a permanent slot leak no route-side aclose can
fix). The route acquires, primes (`await anext(agen)`), and NEVER calls sem.release() itself —
asyncio.Semaphore is unbounded and a double release silently widens sem(1) forever.
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator

import httpx

from .config import Settings
from .sse import frame

SYSTEM_PREAMBLE = "You are a small demo model on gipc.dev. Answer briefly and safely."


class InferUnavailable(Exception):
    """Ollama unreachable/errored before the first frame — the route maps this to an honest 503."""


async def stream_infer(
    prompt: str, http: httpx.AsyncClient, cfg: Settings, sem: asyncio.Semaphore
) -> AsyncIterator[str]:
    try:  # FIRST statement — the finally below is the sem's single release point
        payload = {
            "model": cfg.ollama_model,
            "prompt": prompt,
            "system": SYSTEM_PREAMBLE,
            "stream": True,
            "options": {"num_predict": cfg.infer_max_tokens},
        }
        timeout = httpx.Timeout(cfg.infer_connect_timeout_s, read=cfg.infer_read_timeout_s)
        t0 = time.monotonic()
        ttft_ms: int | None = None
        meta_sent = False
        try:
            upstream = http.stream(
                "POST", f"{cfg.ollama_url}/api/generate", json=payload, timeout=timeout
            )
            async with upstream as resp:
                if resp.status_code != 200:
                    raise InferUnavailable(f"ollama status {resp.status_code}")
                lines = resp.aiter_lines()
                try:
                    first_line = await anext(lines)
                except StopAsyncIteration as e:
                    raise InferUnavailable("empty stream") from e
                # connected + first chunk in hand → the route can now safely send headers
                yield frame("meta", model=cfg.ollama_model)
                meta_sent = True
                async for line in _chain_lines(first_line, lines):
                    if not line.strip():
                        continue
                    chunk = json.loads(line)
                    text = chunk.get("response", "")
                    if text:
                        if ttft_ms is None:
                            ttft_ms = int((time.monotonic() - t0) * 1000)
                        yield frame("token", text=text)
                    if chunk.get("done"):
                        yield _stats_frame(chunk, ttft_ms or 0, cfg)
                        break
                yield frame("done")
        except InferUnavailable:
            raise
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise InferUnavailable(str(e)) from e
        except (TimeoutError, httpx.HTTPError, json.JSONDecodeError) as e:
            if not meta_sent:
                # headers not committed yet → still promotable to a clean 503
                raise InferUnavailable(str(e)) from e
            # headers are gone (meta yielded) — an honest error frame is the only correct move,
            # even if no token arrived yet (e.g. a malformed FIRST line: primed raw, parsed here)
            yield frame("error", message="the local stream faltered mid-generation.")
    finally:
        sem.release()


async def _chain_lines(first: str, rest: AsyncIterator[str]) -> AsyncIterator[str]:
    yield first
    async for line in rest:
        yield line


def _stats_frame(chunk: dict, ttft_ms: int, cfg: Settings) -> str:
    """Terminal stats from Ollama's own counters. Durations are NANOSECONDS; prices are per-MTok.
    Absent fields default to 0 (prompt_eval_count is omitted on prompt-cache hits)."""
    eval_count = int(chunk.get("eval_count") or 0)
    eval_duration = int(chunk.get("eval_duration") or 0)
    total_duration = int(chunk.get("total_duration") or 0)
    prompt_tokens = int(chunk.get("prompt_eval_count") or 0)
    tok_per_s = round(eval_count / (eval_duration / 1e9), 1) if eval_duration > 0 else 0.0
    duration_ms = int(total_duration / 1e6)
    api_equiv_usd = round(
        prompt_tokens / 1e6 * cfg.price_in_per_mtok + eval_count / 1e6 * cfg.price_out_per_mtok, 6
    )
    return frame(
        "stats",
        ttft_ms=ttft_ms,
        tokens=eval_count,
        prompt_tokens=prompt_tokens,
        duration_ms=duration_ms,
        tok_per_s=tok_per_s,
        api_equiv_usd=api_equiv_usd,
    )
