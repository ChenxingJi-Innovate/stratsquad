"""StratSquad LangGraph StateGraph.

Topology:

  START
    ↓
  orchestrator (produce 4 subtask briefs)
    ↓
  ┌─ retrieve (RAG hybrid → top-5)
  │  trend_dispatch (planner + 9-source parallel fetch)
  └─ (both run in parallel — neither depends on the other)
    ↓
  ┌─ competitor   ┐
  │  trend        │ (all 4 in parallel via Send-style fanout)
  │  market       │
  └─ risk         ┘
    ↓
  judge (4-dim rubric, recompute total + verdict)
    ↓
  conditional: any verdict='retry' and retry_round==0?
    ├─ YES → mark_retry → (competitor/trend/market/risk for retry agents) → judge
    └─ NO → composer
    ↓
  composer (final brief)
    ↓
  END
"""
from __future__ import annotations
from langgraph.graph import StateGraph, START, END

from .state import StratSquadState
from .types import JUDGE_PASS_THRESHOLD
from .nodes.orchestrator import orchestrator_node
from .nodes.retrieve import retrieve_node
from .nodes.trend_dispatch import trend_dispatch_node
from .nodes.experts import competitor_node, trend_node, market_node, risk_node
from .nodes.judge import judge_node
from .nodes.composer import composer_node


def _mark_retry(state: StratSquadState) -> dict:
    """Identify which sub-agents failed the rubric and store them for the next round."""
    scores = state.get("scores", []) or []
    retry_agents = [s.agent for s in scores if s.verdict == "retry"]
    return {"retries": retry_agents, "retry_round": 1}


def _after_judge(state: StratSquadState) -> str:
    """Conditional edge: route to retry branch or directly to composer."""
    scores = state.get("scores", []) or []
    has_retry = any(s.verdict == "retry" for s in scores)
    already_retried = (state.get("retry_round", 0) or 0) >= 1
    return "mark_retry" if has_retry and not already_retried else "composer"


def build_graph():
    g = StateGraph(StratSquadState)

    g.add_node("orchestrator", orchestrator_node)
    g.add_node("retrieve", retrieve_node)
    g.add_node("trend_dispatch", trend_dispatch_node)

    g.add_node("competitor", competitor_node)
    g.add_node("trend", trend_node)
    g.add_node("market", market_node)
    g.add_node("risk", risk_node)

    g.add_node("judge", judge_node)
    g.add_node("mark_retry", _mark_retry)
    g.add_node("composer", composer_node)

    # orchestrator → fan out to RAG retrieve + trend dispatch in parallel
    g.add_edge(START, "orchestrator")
    g.add_edge("orchestrator", "retrieve")
    g.add_edge("orchestrator", "trend_dispatch")

    # Both must complete before the 4 experts run
    for expert in ("competitor", "trend", "market", "risk"):
        g.add_edge("retrieve", expert)
        g.add_edge("trend_dispatch", expert)
        g.add_edge(expert, "judge")

    g.add_conditional_edges("judge", _after_judge, {"mark_retry": "mark_retry", "composer": "composer"})

    # Retry round: dispatch the 4 experts again (they self-check attempt via state.retries),
    # then re-judge once.
    for expert in ("competitor", "trend", "market", "risk"):
        g.add_edge("mark_retry", expert)

    g.add_edge("composer", END)
    return g.compile()


# Compile once at import time so the FastAPI route can reuse it.
GRAPH = build_graph()
