"""YouTube Data API v3. Needs YOUTUBE_API_KEY."""
from __future__ import annotations
import os
from urllib.parse import quote

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json, fmt_num


async def fetch_youtube(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        key = os.getenv("YOUTUBE_API_KEY")
        if not key:
            raise RuntimeError("YOUTUBE_API_KEY not set")
        keywords = (query.keywords or [])[:3]
        if not keywords:
            raise ValueError("no keywords")
        q = quote(" ".join(keywords))
        region = (query.region or "US").upper()

        search_url = (
            f"https://www.googleapis.com/youtube/v3/search?part=snippet&q={q}"
            f"&type=video&videoCategoryId=20&order=viewCount&maxResults=10"
            f"&regionCode={region}&key={key}"
        )
        search = await fetch_json(search_url)
        ids = [i["id"]["videoId"] for i in (search.get("items") or []) if i.get("id", {}).get("videoId")]
        if not ids:
            raise ValueError("no videos")
        stats_url = (
            f"https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet"
            f"&id={','.join(ids)}&key={key}"
        )
        stats = await fetch_json(stats_url)
        rows = [
            {
                "title": v["snippet"]["title"],
                "channel": v["snippet"]["channelTitle"],
                "views": int(v.get("statistics", {}).get("viewCount", 0)),
                "likes": int(v.get("statistics", {}).get("likeCount", 0)),
            }
            for v in stats.get("items", [])
        ]
        rows.sort(key=lambda r: r["views"], reverse=True)
        total_views = sum(r["views"] for r in rows)
        datapoints = [
            TrendDatapoint(label=r["title"][:40], value=float(r["views"]), meta={"channel": r["channel"], "likes": r["likes"]})
            for r in rows[:10]
        ]
        summary = f"YouTube {' / '.join(keywords)} 区域 {region}，Top 10 视频总播放 {fmt_num(total_views)}，第一名 {fmt_num(rows[0]['views'])}。"
        digest_lines = [
            f"# YouTube · {' / '.join(keywords)} · {region}",
            "",
            f"**Top 10 视频总播放**：{fmt_num(total_views)}",
            "",
        ]
        for i, r in enumerate(rows[:5]):
            digest_lines.append(f"{i+1}. {r['title'][:70]} ({r['channel']}) · {fmt_num(r['views'])} 播放 · {fmt_num(r['likes'])} 赞")
        return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

    return await wrap("youtube", query, body)
