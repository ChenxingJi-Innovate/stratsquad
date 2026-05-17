"""Huya — public live category list."""
from __future__ import annotations

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json, fmt_num


HUYA_CATEGORY_ID = {
    "lol": 1, "英雄联盟": 1, "王者荣耀": 2336, "honor of kings": 2336,
    "dota2": 5, "dota": 5, "永劫无间": 6090, "naraka": 6090, "原神": 3203,
    "genshin": 3203, "apex": 5973, "apex legends": 5973, "绝地求生": 2356,
    "pubg": 2356, "和平精英": 4438, "英雄联盟手游": 6010, "wild rift": 6010,
    "逆水寒": 6620, "永劫": 6090, "战地": 5887, "使命召唤": 5879, "cod": 5879,
    "我的世界": 660, "minecraft": 660, "梦幻西游": 1366,
}


async def fetch_huya(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        category = (query.category or "").lower().strip()
        game_id = HUYA_CATEGORY_ID.get(category)
        if not game_id:
            raise ValueError(f"unknown huya category: {category}")
        url = f"https://live.huya.com/liveHttpUI/getLiveList?gameId={game_id}&tagAll=0&page=1"
        r = await fetch_json(url)
        rooms = ((r.get("data") or {}).get("datas")) or []
        if not rooms:
            raise ValueError("empty room list")
        top = rooms[:10]
        total = sum(x.get("totalCount", 0) for x in rooms)
        datapoints = [TrendDatapoint(label=r["nick"], value=float(r["totalCount"]), meta={"intro": r.get("introduction", "")}) for r in top]
        summary = f"虎牙「{category}」当前 {len(rooms)} 路直播，总热度 {fmt_num(total)}（峰值非真人观众数，是虎牙的热度值）。"
        digest_lines = [
            f"# 虎牙直播 · {category} (gameId {game_id})",
            "",
            f"**当前直播间**：{len(rooms)} 路 · **总热度**：{fmt_num(total)}",
            "",
            "## 热度前 10",
        ]
        for i, x in enumerate(top):
            digest_lines.append(f"{i+1}. **{x['nick']}** · 热度 {fmt_num(x['totalCount'])} · {x.get('introduction', '')[:40]}")
        return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

    return await wrap("huya", query, body)
