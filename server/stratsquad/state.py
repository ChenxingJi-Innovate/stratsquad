"""StratSquad LangGraph state schema.

Channels (with reducers where order or merge matters):
- question         the raw user question
- corpus           optional user-supplied context text passed to orchestrator
- enabled_sources  which trend sources the user enabled (None = all)
- user_chunks      embedded chunks from the user's uploaded KB
- plan             4 Subtasks from the orchestrator
- rag_hits         top-k hybrid retrieval result
- trend_plan       what the planner picked (rationale + queries)
- trend_results    per-source TrendResult, accumulates via operator.add
- trend_bundle     final aggregate
- outputs          dict keyed by SubAgent → markdown string; merge-by-key
- scores           latest JudgeScore[]
- retries          list of SubAgent names that were retried
- brief            final composer markdown
- attempt          per-agent retry counter (1 = first run, 2 = retry)
"""
from __future__ import annotations
import operator
from typing import Annotated, Optional, TypedDict
from .types import (
    Subtask, JudgeScore, RagHit, UserChunk,
    TrendQueryPlan, TrendResult, TrendDataBundle, SubAgent, TrendSource,
)


def merge_outputs(left: dict, right: dict) -> dict:
    """Reducer: merge sub-agent outputs by key. Right overwrites left for same key."""
    return {**left, **right}


def replace(_left, right):
    """Reducer for fields where the latest write wins (e.g. plan, scores)."""
    return right


class StratSquadState(TypedDict, total=False):
    # Inputs
    question: str
    corpus: str
    enabled_sources: Optional[list[TrendSource]]
    user_chunks: list[UserChunk]

    # Mid-flight
    plan: Annotated[list[Subtask], replace]
    rag_hits: Annotated[list[RagHit], replace]
    trend_plan: Annotated[Optional[TrendQueryPlan], replace]
    trend_results: Annotated[list[TrendResult], operator.add]
    trend_bundle: Annotated[Optional[TrendDataBundle], replace]

    # Sub-agent outputs (parallel writes merged by key)
    outputs: Annotated[dict[SubAgent, str], merge_outputs]

    # Judge + retry control
    scores: Annotated[list[JudgeScore], replace]
    retries: Annotated[list[SubAgent], operator.add]
    retry_round: Annotated[int, replace]   # 0 before first judge, 1 after retry

    # Final
    brief: Annotated[str, replace]
