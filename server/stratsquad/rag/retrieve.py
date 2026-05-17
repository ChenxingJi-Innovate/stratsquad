"""Cosine retrieve + hybrid (corpus + user uploads) + reranker."""
from __future__ import annotations
import math

from ..types import RagHit, UserChunk
from .embed import embed
from .rerank import rerank
from .store import load_store


def _cosine(a: list[float], b: list[float]) -> float:
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    denom = math.sqrt(na) * math.sqrt(nb)
    return 0.0 if denom == 0 else dot / denom


async def retrieve(query: str, k: int = 5) -> list[RagHit]:
    """Dense retrieve over static corpus only."""
    store = load_store()
    if not store:
        return []
    vecs = await embed([query])
    if not vecs:
        return []
    qv = vecs[0]
    scored = [
        RagHit(
            id=c["id"], source=c["source"], heading=c.get("heading"),
            text=c["text"], score=_cosine(qv, c["vector"]), origin="corpus",
        )
        for c in store
    ]
    scored.sort(key=lambda h: h.score, reverse=True)
    return scored[:k]


async def retrieve_hybrid(
    query: str,
    user_chunks: list[UserChunk],
    candidate_k: int = 20,
    final_k: int = 5,
) -> list[RagHit]:
    """Dense over (static corpus + user chunks) → top candidate_k → BGE reranker → top final_k."""
    vecs = await embed([query])
    if not vecs:
        return []
    qv = vecs[0]

    static_hits = [
        RagHit(
            id=c["id"], source=c["source"], heading=c.get("heading"),
            text=c["text"], score=_cosine(qv, c["vector"]), origin="corpus",
        )
        for c in load_store()
    ]
    user_hits = [
        RagHit(
            id=c.id, source=c.source, heading=c.heading,
            text=c.text, score=_cosine(qv, c.embedding), origin="user",
        )
        for c in user_chunks
    ]
    merged = sorted(static_hits + user_hits, key=lambda h: h.score, reverse=True)[:candidate_k]
    return await rerank(query, merged, final_k)
