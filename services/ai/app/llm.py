"""Thin seam over the Anthropic streaming API — ALWAYS mocked in tests (pytest never hits the network).

`stream(...)` returns the SDK's MessageStreamManager (an async context manager exposing `.text_stream`
async-iter of str deltas and `await .get_final_message()` → a Message with `.content` blocks, `.stop_reason`,
`.usage.input_tokens/output_tokens`). A fake with the same shape is injected in tests via set_llm().
"""

from typing import Any, Protocol

from .config import get_settings


class LLM(Protocol):
    def stream(self, **kwargs: Any) -> Any: ...  # -> async context manager (MessageStreamManager-like)

    async def create(self, **kwargs: Any) -> Any: ...  # -> Message (.content/.usage/.stop_reason)


class AnthropicLLM:
    def __init__(self, api_key: str) -> None:
        from anthropic import AsyncAnthropic  # deferred import — never needed under pytest

        self._client = AsyncAnthropic(api_key=api_key)

    def stream(self, **kwargs: Any) -> Any:
        return self._client.messages.stream(**kwargs)

    async def create(self, **kwargs: Any) -> Any:
        return await self._client.messages.create(**kwargs)


_llm: LLM | None = None


def get_llm() -> LLM | None:
    global _llm
    if _llm is None:
        cfg = get_settings()
        if cfg.anthropic_configured:
            _llm = AnthropicLLM(cfg.anthropic_api_key.get_secret_value())
    return _llm


def set_llm(llm: LLM | None) -> None:
    """Test seam."""
    global _llm
    _llm = llm
