"""Parallel dispatch of trend queries. Each result is streamed to the UI as it lands."""
from __future__ import annotations
import asyncio
from langgraph.config import get_stream_writer

from ..types import TrendQuery, TrendResult, TrendQueryPlan, TrendDataBundle
from .google_trends import fetch_google_trends
from .steam import fetch_steam
from .twitch import fetch_twitch
from .reddit import fetch_reddit
from .youtube import fetch_youtube
from .appstore import fetch_appstore
from .huya import fetch_huya
from .douyu import fetch_douyu
from .bilibili import fetch_bilibili


FETCHERS = {
    "google-trends": fetch_google_trends,
    "steam": fetch_steam,
    "twitch": fetch_twitch,
    "reddit": fetch_reddit,
    "youtube": fetch_youtube,
    "appstore": fetch_appstore,
    "huya": fetch_huya,
    "douyu": fetch_douyu,
    "bilibili": fetch_bilibili,
}


async def dispatch_trend_queries(plan: TrendQueryPlan) -> TrendDataBundle:
    writer = get_stream_writer()

    async def run_one(q: TrendQuery) -> TrendResult:
        fn = FETCHERS.get(q.source)
        if not fn:
            from time import time as _t
            return TrendResult(
                ok=False, source=q.source, label=q.source, query=q,
                error="unknown source", fetched_at=int(_t() * 1000), latency_ms=0,
            )
        r = await fn(q)
        writer({"type": "trend_result", "result": r.model_dump(by_alias=True, exclude_none=True)})
        return r

    results = await asyncio.gather(*[run_one(q) for q in plan.queries])
    bundle = TrendDataBundle(plan=plan, results=list(results))
    writer({"type": "trend_bundle", "bundle": bundle.model_dump(by_alias=True, exclude_none=True)})
    return bundle
