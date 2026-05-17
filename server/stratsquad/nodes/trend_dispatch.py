"""Trend planner + dispatch as a single graph node.

Best-effort. If the LLM planner fails or 0 queries come back, trend_bundle stays None
and the trend expert agent works off RAG hits + parametric knowledge.
"""
from __future__ import annotations

from ..state import StratSquadState
from ..trends.planner import run_trend_planner
from ..trends.dispatch import dispatch_trend_queries


def _brief_of(state: StratSquadState, agent: str) -> str:
    plan = state.get("plan", []) or []
    for sub in plan:
        if (sub.agent if hasattr(sub, "agent") else sub["agent"]) == agent:
            return sub.brief if hasattr(sub, "brief") else sub["brief"]
    return ""


async def trend_dispatch_node(state: StratSquadState) -> dict:
    enabled = state.get("enabled_sources")
    if enabled is not None and len(enabled) == 0:
        return {"trend_bundle": None}
    try:
        plan = await run_trend_planner(
            trend_brief=_brief_of(state, "trend"),
            question=state["question"],
            enabled_sources=enabled,
        )
    except Exception as e:
        print(f"trend planner failed: {e}")
        return {"trend_plan": None, "trend_bundle": None}

    if not plan.queries:
        return {"trend_plan": plan, "trend_bundle": None}

    try:
        bundle = await dispatch_trend_queries(plan)
        return {"trend_plan": plan, "trend_bundle": bundle, "trend_results": bundle.results}
    except Exception as e:
        print(f"trend dispatch failed: {e}")
        return {"trend_plan": plan, "trend_bundle": None}
