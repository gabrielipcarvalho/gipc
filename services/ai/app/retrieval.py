"""RAG retrieval — shared by the /api/ai/search route and the oracle's search_corpus tool.

Fixed server-side query shape (no user-controlled SQL), embedding passed as a pgvector literal cast.
Raises on db/embedder failure; callers map that to an honest 503 (route) or a tool-error dict (oracle).
"""

from . import db
from .embedder import get_embedder, to_vector_literal

TOP_K = 6


async def retrieve(q: str, k: int = TOP_K) -> list[dict]:
    """Top-k corpus chunks by cosine similarity. Returns [{source,title,url,content,score}]."""
    vec = to_vector_literal(get_embedder().embed([q])[0])
    pool = db.pool()
    if pool is None:
        raise RuntimeError("db pool unavailable")
    async with pool.connection(timeout=2) as conn:
        cur = await conn.execute(
            """SELECT source, title, url, content, 1 - (embedding <=> %s::vector) AS score
               FROM chunks ORDER BY embedding <=> %s::vector LIMIT %s""",
            (vec, vec, k),
        )
        rows = await cur.fetchall()
    return [
        {"source": r[0], "title": r[1], "url": r[2], "content": r[3], "score": round(float(r[4]), 4)}
        for r in rows
    ]
