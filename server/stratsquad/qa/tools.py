"""LangChain Tools the Q&A react agent can call.

Two tools that map onto the same primitives the strategy pipeline uses, but
exposed as agentic tools so the model decides when/what to query:

1. search_corpus(query, top_k)  — semantic search over the static corpus +
   the Wikipedia preset, returns the top hits as a markdown blob.
2. query_trend_source(source, payload) — calls one of the 9 live trend
   modules, returns its digest.
"""
from __future__ import annotations
import asyncio
import json
from typing import Any
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from ..preset.registry import load_preset_chunks
from ..rag.retrieve import retrieve_hybrid
from ..trends.dispatch import FETCHERS
from ..types import TrendQuery, TrendSource


class SearchCorpusInput(BaseModel):
    query: str = Field(description="The semantic query — what you want to find evidence about.")
    top_k: int = Field(default=5, ge=1, le=10, description="How many passages to return.")


async def _search_corpus(query: str, top_k: int = 5) -> str:
    """Hybrid retrieval over the static corpus + Wikipedia gaming preset (BGE-M3 dense → BGE reranker)."""
    preset = load_preset_chunks("wikipedia")
    hits = await retrieve_hybrid(query, preset, candidate_k=20, final_k=top_k)
    if not hits:
        return "(no relevant passages found)"
    blocks = []
    for i, h in enumerate(hits, 1):
        head = f"[{i}] {h.source}"
        if h.heading:
            head += f" · §{h.heading}"
        blocks.append(f"{head}\n{h.text[:400]}{'…' if len(h.text) > 400 else ''}")
    return "\n\n".join(blocks)


search_corpus_tool = StructuredTool.from_function(
    coroutine=_search_corpus,
    name="search_corpus",
    description=(
        "Search the gaming-industry knowledge base (static corpus + Wikipedia "
        "preset of 2552 chunks: industry overview, monetization patterns, regional "
        "markets, hit games, publishers, esports). Returns the top-k most relevant "
        "passages with source attribution. Use this when you need authoritative "
        "background, definitions, historical context, or specific facts about a "
        "game/publisher/genre."
    ),
    args_schema=SearchCorpusInput,
)


class QueryTrendInput(BaseModel):
    source: TrendSource = Field(description=(
        "One of: google-trends, steam, twitch, youtube, appstore, huya, douyu, bilibili. "
        "Pick based on what you need: appstore for paid game rankings per country "
        "(region required: us/cn/jp/kr/id/vn/ph/sg/th); steam for PC concurrent players; "
        "twitch/youtube for streaming/video viewership; huya/douyu/bilibili for "
        "mainland-China livestream activity; google-trends for keyword interest."
    ))
    region: str | None = Field(default=None, description="ISO 2-letter country code or WW. Required for appstore + google-trends + youtube.")
    keywords: list[str] | None = Field(default=None, description="Search keywords (for google-trends / youtube / bilibili).")
    game_titles: list[str] | None = Field(default=None, description="Specific game titles (for steam / twitch).")
    category: str | None = Field(default=None, description="Game category name (for huya / douyu / bilibili live). Use Chinese names like 王者荣耀, 原神, 英雄联盟.")


async def _query_trend(source: TrendSource, region: str | None = None,
                        keywords: list[str] | None = None,
                        game_titles: list[str] | None = None,
                        category: str | None = None) -> str:
    """Dispatch one trend source. Returns the digest (markdown) or an error message."""
    fn = FETCHERS.get(source)
    if not fn:
        return f"(unknown source: {source})"
    q = TrendQuery(
        source=source,
        region=region,
        keywords=keywords,
        game_titles=game_titles,
        category=category,
    )
    result = await fn(q)
    if not result.ok:
        return f"(failed: {result.error})"
    return result.digest or result.summary or "(empty response)"


query_trend_tool = StructuredTool.from_function(
    coroutine=_query_trend,
    name="query_trend_source",
    description=(
        "Query one live trend data source (game industry). The 9 supported sources "
        "cover global keyword interest (google-trends), PC concurrent players (steam), "
        "global livestream viewership (twitch), video content (youtube), iOS game "
        "rankings per country (appstore), and mainland-China livestream activity "
        "(huya, douyu, bilibili). Returns a markdown digest of what came back."
    ),
    args_schema=QueryTrendInput,
)


QA_TOOLS = [search_corpus_tool, query_trend_tool]
