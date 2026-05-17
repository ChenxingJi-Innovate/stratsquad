"""Google Trends — unofficial /trends/api/explore + widgetdata flow."""
from __future__ import annotations
import json
from urllib.parse import quote

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json


async def fetch_google_trends(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        keywords = (query.keywords or [])[:5]
        if not keywords:
            raise ValueError("no keywords")
        geo = (query.region or "").upper()
        time_range = query.timeframe or "today 12-m"

        explore_req = {
            "comparisonItem": [
                {"keyword": k, "geo": "" if geo == "WW" else geo, "time": time_range}
                for k in keywords
            ],
            "category": 0,
            "property": "",
        }
        explore_url = (
            "https://trends.google.com/trends/api/explore?hl=en-US&tz=0"
            f"&req={quote(json.dumps(explore_req))}"
        )
        explore = await fetch_json(explore_url)
        widget = next((w for w in explore["widgets"] if w["id"] == "TIMESERIES"), None)
        if not widget:
            raise ValueError("no TIMESERIES widget")

        timeline_url = (
            "https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0"
            f"&req={quote(json.dumps(widget['request']))}"
            f"&token={quote(widget['token'])}"
        )
        timeline = await fetch_json(timeline_url)
        points = (timeline.get("default") or {}).get("timelineData") or []
        if not points:
            raise ValueError("empty timeline")

        avgs = []
        for idx, _ in enumerate(keywords):
            vals = [p.get("value", [0])[idx] for p in points if p.get("value")]
            avgs.append(sum(vals) / max(1, len(vals)))

        peak = max(points, key=lambda p: max(p.get("value", [0]) or [0]))
        datapoints = [
            TrendDatapoint(
                label=p.get("formattedTime") or p.get("time") or str(i),
                value=float(max(p.get("value", [0]) or [0])),
                meta={k: p.get("value", [0])[ki] for ki, k in enumerate(keywords)},
            )
            for i, p in enumerate(points)
        ]

        region = geo or "WW"
        summary = f"关键词 {' / '.join(keywords)} 在 {region} 区域，{time_range} 时段平均热度 {' / '.join(f'{a:.0f}' for a in avgs)}（0-100 相对值）。"
        digest_lines = [
            f"# Google Trends · {' / '.join(keywords)} · {region} · {time_range}",
            "",
            "\n".join(f"- **{k}** 平均热度 {avgs[i]:.1f}/100" for i, k in enumerate(keywords)),
            "",
            f"**全期峰值**：{peak.get('formattedTime') or peak.get('time')}（最高值 {max(peak.get('value', [0]) or [0])}）",
            "",
            f"数据点 {len(points)} 个；首点 {points[0].get('formattedTime') or points[0].get('time')}，尾点 {points[-1].get('formattedTime') or points[-1].get('time')}。",
        ]
        return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

    return await wrap("google-trends", query, body)
