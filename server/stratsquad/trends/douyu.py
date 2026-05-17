"""Douyu — public ranklist API."""
from __future__ import annotations

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json, fmt_num


DOUYU_CATE_ID = {
    "lol": 1, "英雄联盟": 1, "王者荣耀": 207, "honor of kings": 207,
    "dota2": 56, "dota": 56, "原神": 270, "genshin": 270,
    "apex": 250, "apex legends": 250, "绝地求生": 250, "pubg": 250,
    "永劫无间": 304, "naraka": 304, "和平精英": 211, "逆水寒": 7700,
    "英雄联盟手游": 1163, "wild rift": 1163, "我的世界": 184, "minecraft": 184,
    "使命召唤": 219, "cod": 219, "梦幻西游": 71,
}


async def fetch_douyu(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        category = (query.category or "").lower().strip()
        cate_id = DOUYU_CATE_ID.get(category)
        if not cate_id:
            raise ValueError(f"unknown douyu category: {category}")
        url = f"https://www.douyu.com/japi/weblist/apinc/getRanklistByCateId?cateId={cate_id}"
        r = await fetch_json(url)
        rank_list = ((r.get("data") or {}).get("rankList")) or []
        if not rank_list:
            raise ValueError("empty rank list")
        top = rank_list[:10]
        total = sum(x.get("hot", 0) for x in rank_list)
        datapoints = [TrendDatapoint(label=r["nickname"], value=float(r["hot"]), meta={"room": r.get("roomName", "")}) for r in top]
        summary = f"斗鱼「{category}」热度榜 Top 10，第一名 {rank_list[0]['nickname']}（热度 {fmt_num(rank_list[0]['hot'])}）。"
        digest_lines = [
            f"# 斗鱼直播 · {category} (cateId {cate_id})",
            "",
            f"**榜单条目数**：{len(rank_list)} · **总热度**：{fmt_num(total)}",
            "",
            "## 热度前 10",
        ]
        for i, x in enumerate(top):
            digest_lines.append(f"{i+1}. **{x['nickname']}** · 热度 {fmt_num(x['hot'])} · {x.get('roomName', '')[:40]}")
        return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

    return await wrap("douyu", query, body)
