"""RAG retrieval — shared by the /api/ai/search route and the oracle's search_corpus tool.

Fixed server-side query shape (no user-controlled SQL), embedding passed as a pgvector literal cast.
Raises on db/embedder failure; callers map that to an honest 503 (route) or a tool-error dict (oracle).

`code_cap` guards the ORACLE AUTO-CONTEXT against code-chunk dilution (the self-aware corpus makes
code >50% of the KB): when set, at most that many source=="code" rows are admitted to the top-k.
ONLY oracle.py's automatic retrieve passes it — the search_corpus tool and /api/ai/search stay
uncapped, so explicit implementation questions always reach the code chunks.
"""

from . import db
from .embedder import get_embedder, to_vector_literal

TOP_K = 6
CODE_CAP = 2  # max code rows in the oracle auto-context (see oracle.py)
_FETCH_LIMIT = 128  # KB is ~62 rows today — generous headroom so the cap can fill k as it grows


async def retrieve(q: str, k: int = TOP_K, code_cap: int | None = None) -> list[dict]:
    """Top-k corpus chunks by cosine similarity. Returns [{source,title,url,content,score}].
    code_cap=None (default) is exactly the historical behaviour."""
    vec = to_vector_literal(get_embedder().embed([q])[0])
    pool = db.pool()
    if pool is None:
        raise RuntimeError("db pool unavailable")
    limit = k if code_cap is None else _FETCH_LIMIT
    async with pool.connection(timeout=2) as conn:
        cur = await conn.execute(
            """SELECT source, title, url, content, 1 - (embedding <=> %s::vector) AS score
               FROM chunks ORDER BY embedding <=> %s::vector LIMIT %s""",
            (vec, vec, limit),
        )
        rows = await cur.fetchall()
    out = [
        {"source": r[0], "title": r[1], "url": r[2], "content": r[3], "score": round(float(r[4]), 4)}
        for r in rows
    ]
    if code_cap is None:
        return out
    return _cap_code(out, k, code_cap)


def _cap_code(rows: list[dict], k: int, code_cap: int) -> list[dict]:
    """Score-order filter: admit at most `code_cap` code rows, stop at k total. Pure + tested."""
    kept: list[dict] = []
    code_seen = 0
    for r in rows:
        if r["source"] == "code":
            if code_seen >= code_cap:
                continue
            code_seen += 1
        kept.append(r)
        if len(kept) >= k:
            break
    return kept
