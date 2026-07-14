"""Local ONNX embeddings (fastembed, bge-small-en-v1.5, 384-dim). No external API — vectors never
leave the box. The model is BAKED into the image at build (FASTEMBED_CACHE_PATH); runtime is offline.
Tests inject a fake via the Embedder protocol — fastembed is never imported under pytest.
"""

import time
from typing import Protocol

from .log import info

MODEL_NAME = "BAAI/bge-small-en-v1.5"
DIM = 384


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class FastEmbedder:
    def __init__(self) -> None:
        from fastembed import TextEmbedding  # deferred — heavy import, never under pytest

        t0 = time.monotonic()
        self._model = TextEmbedding(MODEL_NAME)
        info("embedder loaded", model=MODEL_NAME, load_ms=int((time.monotonic() - t0) * 1000))

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._model.embed(texts)]


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = FastEmbedder()
    return _embedder


def set_embedder(e: Embedder | None) -> None:
    """Test seam (and lifespan warm-up assignment)."""
    global _embedder
    _embedder = e


def to_vector_literal(vec: list[float]) -> str:
    """pgvector literal — psycopg3 can't adapt a list to vector; we pass '[...]'::vector."""
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"
