"""Bilibili — public web API. Two paths: live category, or keyword video search."""
from __future__ import annotations
import re
from urllib.parse import quote

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json, fmt_num


BILIBILI_LIVE_AREA = {
    "lol": (86, 2), "英雄联盟": (86, 2),
    "原神": (240, 2), "genshin": (240, 2),
    "王者荣耀": (87, 2), "honor of kings": (87, 2),
    "apex": (235, 2), "apex legends": (235, 2),
    "永劫无间": (638, 2), "naraka": (638, 2),
    "使命召唤手游": (326, 2), "和平精英": (388, 2),
    "蛋仔派对": (681, 2),
    "minecraft": (145, 2), "我的世界": (145, 2),
}


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]*>", "", s)


async def fetch_bilibili(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        category = (query.category or "").lower().strip()
        keywords = (query.keywords or [])[:1]

        if category and category in BILIBILI_LIVE_AREA:
            area, parent = BILIBILI_LIVE_AREA[category]
            url = (
                f"https://api.live.bilibili.com/room/v3/area/getRoomList"
                f"?area_id={area}&parent_area_id={parent}&page=1&page_size=20&platform=web"
            )
            r = await fetch_json(url)
            rooms = ((r.get("data") or {}).get("list")) or []
            if not rooms:
                raise ValueError("empty room list")
            top = rooms[:10]
            total = sum(x.get("online", 0) for x in rooms)
            datapoints = [TrendDatapoint(label=x["uname"], value=float(x["online"]), meta={"title": x.get("title", "")}) for x in top]
            summary = f"B站直播「{category}」当前 {len(rooms)} 路直播，总在线热度 {fmt_num(total)}。"
            digest_lines = [
                f"# 哔哩哔哩直播 · {category} (area {area})",
                "",
                f"**当前直播间**：{len(rooms)} 路 · **总在线热度**：{fmt_num(total)}",
                "",
                "## 热度前 10",
            ]
            for i, x in enumerate(top):
                digest_lines.append(f"{i+1}. **{x['uname']}** · 在线 {fmt_num(x['online'])} · {x.get('title', '')[:40]}")
            return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

        if not keywords:
            raise ValueError("no category and no keyword")
        q = keywords[0]
        url = f"https://api.bilibili.com/x/web-interface/search/all/v2?keyword={quote(q)}"
        r = await fetch_json(url, headers={"Referer": "https://www.bilibili.com/"})
        video_block = next(
            (b for b in (r.get("data") or {}).get("result", []) if b.get("result_type") == "video"),
            None,
        )
        videos = ((video_block or {}).get("data") or [])[:10]
        if not videos:
            raise ValueError("no videos")
        total_play = sum(v.get("play", 0) for v in videos)
        datapoints = [
            TrendDatapoint(label=_strip_html(v["title"])[:30], value=float(v.get("play", 0)),
                           meta={"author": v.get("author", ""), "bvid": v.get("bvid", "")})
            for v in videos
        ]
        summary = f"B站搜索「{q}」前 10 视频总播放 {fmt_num(total_play)}，第一名 {fmt_num(videos[0].get('play', 0))} 播放。"
        digest_lines = [
            f"# 哔哩哔哩 · 视频搜索「{q}」",
            "",
            f"**Top 10 总播放**：{fmt_num(total_play)}",
            "",
        ]
        for i, v in enumerate(videos[:5]):
            digest_lines.append(f"{i+1}. {_strip_html(v['title'])[:70]} · @{v.get('author', '')} · {fmt_num(v.get('play', 0))} 播放")
        return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

    return await wrap("bilibili", query, body)
