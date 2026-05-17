"""BGE reranker via SiliconFlow. Falls back to dense-only if key missing or call fails."""
from __future__ import annotations
import os
import httpx

from ..types import RagHit


RERANK_MODEL = os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
BASE = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")


async def rerank(query: str, hits: list[RagHit], top_k: int = 5) -> list[RagHit]:
    if not hits:
        return []
    key = os.getenv("SILICONFLOW_API_KEY")
    if not key:
        return hits[:top_k]
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{BASE}/rerank",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": RERANK_MODEL,
                    "query": query,
                    "documents": [h.text for h in hits],
                    "top_n": min(top_k, len(hits)),
                    "return_documents": False,
                },
            )
            if res.status_code != 200:
                return hits[:top_k]
            results = res.json().get("results", [])
    except Exception:
        return hits[:top_k]

    out: list[RagHit] = []
    for r in results:
        idx = r.get("index")
        if idx is None or idx >= len(hits):
            continue
        h = hits[idx].model_copy(update={"rerank_score": r.get("relevance_score")})
        out.append(h)
    return out[:top_k]
