"""GET /api/ai/search — RAG retrieval with citations over the public corpus.

Fixed server-side query shape (LIMIT 6, no user-controlled SQL), q length-capped, rate-limited by the
global limiter. Honest 503 while the knowledge base (pool/schema/embedder) isn't ready.
"""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from .. import db
from ..embedder import get_embedder, to_vector_literal

router = APIRouter()

SNIPPET_MAX = 400
TOP_K = 6


@router.get("/api/ai/search")
async def search(q: str = Query(min_length=2, max_length=200)) -> object:
    if not await db.kb_ready():
        return JSONResponse({"error": "knowledge base unavailable"}, status_code=503)
    try:
        vec = to_vector_literal(get_embedder().embed([q])[0])
    except Exception:
        return JSONResponse({"error": "knowledge base unavailable"}, status_code=503)

    pool = db.pool()
    assert pool is not None  # kb_ready guarantees it
    async with pool.connection(timeout=2) as conn:
        cur = await conn.execute(
            """SELECT source, title, url, content, 1 - (embedding <=> %s::vector) AS score
               FROM chunks ORDER BY embedding <=> %s::vector LIMIT %s""",
            (vec, vec, TOP_K),
        )
        rows = await cur.fetchall()

    results = [
        {
            "source": r[0],
            "title": r[1],
            "url": r[2],
            "snippet": (r[3][: SNIPPET_MAX - 1] + "…") if len(r[3]) > SNIPPET_MAX else r[3],
            "score": round(float(r[4]), 4),
        }
        for r in rows
    ]
    return {"results": results, "count": len(results)}
