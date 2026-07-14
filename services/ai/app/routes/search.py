"""GET /api/ai/search — RAG retrieval with citations over the public corpus.

Thin caller over app.retrieval; q length-capped, rate-limited by the global limiter. Honest 503 while the
knowledge base (pool/schema/embedder) isn't ready. Responses NEVER include ids/hashes.
"""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from .. import db
from ..retrieval import retrieve

router = APIRouter()

SNIPPET_MAX = 400


@router.get("/api/ai/search")
async def search(q: str = Query(min_length=2, max_length=200)) -> object:
    if not await db.kb_ready():
        return JSONResponse({"error": "knowledge base unavailable"}, status_code=503)
    try:
        rows = await retrieve(q)
    except Exception:
        return JSONResponse({"error": "knowledge base unavailable"}, status_code=503)

    results = [
        {
            "source": r["source"],
            "title": r["title"],
            "url": r["url"],
            "snippet": (r["content"][: SNIPPET_MAX - 1] + "…")
            if len(r["content"]) > SNIPPET_MAX
            else r["content"],
            "score": r["score"],
        }
        for r in rows
    ]
    return {"results": results, "count": len(results)}
