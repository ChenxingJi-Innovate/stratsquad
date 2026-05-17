"""Shared helpers for every trend source: timing wrap + httpx with UA + number formatting."""
from __future__ import annotations
import json
import time
from typing import Any, Awaitable, Callable
import httpx

from ..types import TrendQuery, TrendResult, TrendSource


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


SOURCE_LABEL_ZH: dict[TrendSource, str] = {
    "google-trends": "Google 趋势",
    "steam": "Steam 在玩量",
    "twitch": "Twitch 直播",
    "reddit": "Reddit 社区",
    "youtube": "YouTube",
    "appstore": "App Store 榜单",
    "huya": "虎牙直播",
    "douyu": "斗鱼直播",
    "bilibili": "哔哩哔哩",
}


async def wrap(
    source: TrendSource,
    query: TrendQuery,
    body: Callable[[], Awaitable[dict]],
) -> TrendResult:
    """Run the body, time it, normalize ok/error into TrendResult."""
    started = time.time()
    label = SOURCE_LABEL_ZH[source]
    try:
        result = await body()
        return TrendResult(
            ok=True, source=source, label=label, query=query,
            summary=result["summary"], digest=result["digest"],
            datapoints=result.get("datapoints"),
            fetched_at=int(time.time() * 1000),
            latency_ms=int((time.time() - started) * 1000),
        )
    except Exception as e:
        return TrendResult(
            ok=False, source=source, label=label, query=query,
            error=str(e) or "unknown error",
            fetched_at=int(time.time() * 1000),
            latency_ms=int((time.time() - started) * 1000),
        )


async def fetch_json(url: str, *, timeout: float = 10.0, headers: dict | None = None) -> Any:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        res = await client.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*", **(headers or {})})
        res.raise_for_status()
        text = res.text
        # Some endpoints (Google Trends) prefix JSON with )]}'
        for prefix in (")]}'", ")]}'"):
            if text.startswith(prefix):
                text = text[len(prefix):].lstrip()
        return json.loads(text)


async def fetch_text(url: str, *, timeout: float = 10.0, headers: dict | None = None) -> str:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        res = await client.get(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
        res.raise_for_status()
        return res.text


def fmt_num(n: float) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(int(n))
