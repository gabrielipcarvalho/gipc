"""Idempotent corpus ingest — run as a k8s Job: `python -m app.ingest`.

Full sync: upsert every current chunk by content_hash, then DELETE rows whose hash is no longer in
the corpus (removed facts must actually disappear). Re-running against an unchanged corpus is a no-op.
"""

import asyncio
import os
import sys
from pathlib import Path

from . import db
from .corpus import load_corpus
from .embedder import get_embedder, to_vector_literal
from .log import configure_logging, error, info


async def run() -> int:
    corpus_dir = Path(os.environ.get("CORPUS_DIR", "/app/corpus"))
    chunks = load_corpus(corpus_dir)
    if not chunks:
        error("ingest: empty corpus", dir=str(corpus_dir))
        return 1

    await db.open_pool()
    try:
        if not await db.ensure_schema():
            error("ingest: schema unavailable")
            return 1
        vectors = get_embedder().embed([c.content for c in chunks])

        pool = db.pool()
        assert pool is not None
        inserted = 0
        async with pool.connection() as conn:
            for chunk, vec in zip(chunks, vectors, strict=True):
                cur = await conn.execute(
                    """INSERT INTO chunks (source, title, url, content, content_hash, embedding)
                       VALUES (%s, %s, %s, %s, %s, %s::vector)
                       ON CONFLICT (content_hash) DO NOTHING""",
                    (chunk.source, chunk.title, chunk.url, chunk.content,
                     chunk.content_hash, to_vector_literal(vec)),
                )
                inserted += cur.rowcount
            hashes = [c.content_hash for c in chunks]
            cur = await conn.execute(
                "DELETE FROM chunks WHERE NOT (content_hash = ANY(%s))", (hashes,)
            )
            removed = cur.rowcount
            await conn.commit()
        info("ingest complete", chunks=len(chunks), inserted=inserted, removed_stale=removed)
        return 0
    finally:
        await db.close_pool()


if __name__ == "__main__":
    configure_logging()
    sys.exit(asyncio.run(run()))
