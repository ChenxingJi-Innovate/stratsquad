"""RAG retrieve node. Hybrid if user uploaded KB chunks, dense-only otherwise."""
from __future__ import annotations
import os
from langgraph.config import get_stream_writer

from ..rag.retrieve import retrieve, retrieve_hybrid
from ..state import StratSquadState


def _brief_of(state: StratSquadState, agent: str) -> str:
    plan = state.get("plan", []) or []
    for sub in plan:
        if (sub.agent if hasattr(sub, "agent") else sub["agent"]) == agent:
            return sub.brief if hasattr(sub, "brief") else sub["brief"]
    return ""


async def retrieve_node(state: StratSquadState) -> dict:
    if not os.getenv("SILICONFLOW_API_KEY"):
        return {"rag_hits": []}

    trend_brief = _brief_of(state, "trend")
    user_chunks = state.get("user_chunks", []) or []
    try:
        if user_chunks:
            hits = await retrieve_hybrid(trend_brief, user_chunks, candidate_k=20, final_k=5)
        else:
            hits = await retrieve(trend_brief, k=5)
    except Exception as e:
        print(f"retrieve failed: {e}")
        return {"rag_hits": []}

    writer = get_stream_writer()
    writer({
        "type": "rag_hits",
        "query": trend_brief,
        "hits": [h.model_dump(by_alias=True, exclude_none=True) for h in hits],
    })
    return {"rag_hits": hits}
