"""Pydantic models matching the frontend StreamEvent + RagHit + TrendResult etc.

These are wire types for SSE. Field names use camelCase (via Pydantic Field aliases) so the
TypeScript frontend can JSON.parse() events without renaming. Internally Python uses snake_case.
"""
from __future__ import annotations
from typing import Literal, Optional, Any, Union
from pydantic import BaseModel, Field, ConfigDict


class CamelModel(BaseModel):
    """Base model that serializes snake_case fields as camelCase on the wire."""
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=lambda s: s.split("_")[0] + "".join(w.title() for w in s.split("_")[1:]),
    )


# ─── Agent roster ────────────────────────────────────────────────────────────
AgentName = Literal[
    "orchestrator", "competitor", "trend", "market", "risk", "judge", "composer"
]
SubAgent = Literal["competitor", "trend", "market", "risk"]


# ─── Plan ────────────────────────────────────────────────────────────────────
class Subtask(CamelModel):
    agent: SubAgent
    brief: str


# ─── Judge ───────────────────────────────────────────────────────────────────
class JudgeScore(CamelModel):
    agent: SubAgent
    evidence: int
    logic: int
    actionability: int
    novelty: int
    total: int
    verdict: Literal["pass", "retry"]
    reason: str


JUDGE_PASS_THRESHOLD = 70


# ─── RAG ─────────────────────────────────────────────────────────────────────
class RagHit(CamelModel):
    id: str
    source: str
    heading: Optional[str] = None
    text: str
    score: float
    origin: Optional[Literal["corpus", "user"]] = None
    rerank_score: Optional[float] = None


class UserChunk(CamelModel):
    id: str
    text: str
    embedding: list[float]
    source: str
    heading: Optional[str] = None


# A preset corpus available on the server. The chunks live on disk (too large to
# round-trip), so the client opts in by id and the server merges them into the
# retrieval pool inside /api/run.
class PresetInfo(CamelModel):
    id: str
    name: str
    description: str
    page_count: int
    chunk_count: int


# ─── Trend data ──────────────────────────────────────────────────────────────
TrendSource = Literal[
    "google-trends", "steam", "twitch", "reddit", "youtube",
    "appstore", "huya", "douyu", "bilibili",
]


class TrendQuery(CamelModel):
    source: TrendSource
    keywords: Optional[list[str]] = None
    region: Optional[str] = None
    game_titles: Optional[list[str]] = None
    subreddits: Optional[list[str]] = None
    category: Optional[str] = None
    timeframe: Optional[str] = None


class TrendDatapoint(CamelModel):
    label: str
    value: float
    meta: Optional[dict[str, Any]] = None


class TrendResult(CamelModel):
    ok: bool
    source: TrendSource
    label: str
    query: TrendQuery
    summary: Optional[str] = None
    digest: Optional[str] = None
    datapoints: Optional[list[TrendDatapoint]] = None
    error: Optional[str] = None
    fetched_at: int
    latency_ms: int


class TrendQueryPlan(CamelModel):
    rationale: str
    queries: list[TrendQuery]


class TrendDataBundle(CamelModel):
    plan: TrendQueryPlan
    results: list[TrendResult]


# ─── Stream events (wire format for SSE) ─────────────────────────────────────
# We use a discriminated union of TypedDicts for emission convenience; pydantic
# would force a heavier serialization step we don't need here.
StreamEvent = dict
