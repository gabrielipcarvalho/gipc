"""Fixed, read-only tool registry for the oracle agent.

Security invariant: tools are a CLOSED enum. get_status/uptime/deploys take NO args and hit fixed literal
paths on gipc.dev's own public API; search_corpus takes a single length-capped query that is only ever
passed as a parameterized RAG query — NO user value is ever interpolated into a URL path. Every failure
returns an error dict (never raises into the agent loop, so the model can recover honestly).
"""

from typing import Any

import httpx

from .config import Settings
from .retrieval import retrieve

TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_status",
        "description": "Live platform metrics right now (CPU, memory, request rate, p99 latency, "
        "error rate) from Prometheus. Use for 'what's the load/status right now?'.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_uptime",
        "description": "Uptime percentage and recent up/down history per monitored target.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_deploys",
        "description": "Recent deployments to the platform (most recent first).",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_corpus",
        "description": "Search the public knowledge base (Gabriel's résumé, projects, site docs, and the "
        "site's own source code) for facts. Use for any claim about Gabriel's experience, "
        "skills, or projects — and for how this site itself is implemented.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "maxLength": 200}},
            "required": ["query"],
        },
    },
]

TOOL_NAMES = frozenset(t["name"] for t in TOOLS)

_FIXED_PATHS = {"get_status": "/api/status", "get_uptime": "/api/uptime", "get_deploys": "/api/deploys"}


async def dispatch(name: str, args: dict, http: httpx.AsyncClient, cfg: Settings) -> dict:
    if name in _FIXED_PATHS:
        return await _get_json(http, f"{cfg.core_base}{_FIXED_PATHS[name]}")
    if name == "search_corpus":
        q = str(args.get("query", ""))[:200]
        if not q.strip():
            return {"error": "empty query"}
        try:
            rows = await retrieve(q)
        except Exception:
            return {"error": "knowledge base unavailable"}
        return {"results": [{"title": r["title"], "url": r["url"], "score": r["score"],
                             "content": r["content"][:500]} for r in rows]}
    return {"error": f"unknown tool: {name}"}


async def _get_json(http: httpx.AsyncClient, url: str) -> dict:
    try:
        r = await http.get(url, timeout=3)
        r.raise_for_status()
        data = r.json()
    except Exception:
        return {"error": "upstream unavailable"}
    return _trim(data)


def _trim(data: Any) -> dict:
    """Keep tool results compact — the model doesn't need full payloads and tokens cost money."""
    if isinstance(data, dict):
        if "metrics" in data:  # status: keep the metric name→value map
            return {"metrics": {k: v.get("value") if isinstance(v, dict) else v
                                for k, v in data.get("metrics", {}).items()}}
        if "targets" in data:  # uptime: per-target pct
            return {"targets": [{"name": t.get("name"), "status": t.get("status"),
                                 "uptimePct": t.get("uptimePct")} for t in data.get("targets", [])]}
        return data
    if isinstance(data, list):  # deploys: last 3, trimmed
        return {"deploys": data[:3]}
    return {"result": data}
