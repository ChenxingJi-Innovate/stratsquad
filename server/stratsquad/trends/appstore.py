"""iTunes RSS feed. No key. Genre 6014 = Games."""
from __future__ import annotations

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json


COUNTRY_LABEL = {
    "us": "美国", "cn": "中国", "jp": "日本", "kr": "韩国", "id": "印尼",
    "vn": "越南", "ph": "菲律宾", "sg": "新加坡", "th": "泰国", "my": "马来西亚",
    "tw": "台湾", "hk": "香港", "gb": "英国", "fr": "法国", "de": "德国",
}


async def fetch_appstore(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        region = (query.region or "us").lower()
        country = region if len(region) == 2 else "us"
        kinds = [
            ("topfreeapplications", "免费榜"),
            ("topgrossingapplications", "畅销榜"),
        ]
        all_entries = []
        for slug, zh in kinds:
            try:
                url = f"https://itunes.apple.com/{country}/rss/{slug}/limit=25/genre=6014/json"
                r = await fetch_json(url)
                entries = (r.get("feed") or {}).get("entry", [])[:15]
                for i, e in enumerate(entries):
                    all_entries.append({
                        "kind": zh,
                        "rank": i + 1,
                        "name": e["im:name"]["label"],
                        "artist": e["im:artist"]["label"],
                    })
            except Exception:
                continue
        if not all_entries:
            raise ValueError("no entries")
        free = [x for x in all_entries if x["kind"] == "免费榜"]
        grossing = [x for x in all_entries if x["kind"] == "畅销榜"]
        datapoints = [
            TrendDatapoint(label=x["name"][:30], value=float(16 - x["rank"]),
                           meta={"artist": x["artist"], "rank": x["rank"]})
            for x in grossing[:10]
        ]
        c_label = COUNTRY_LABEL.get(country, country.upper())
        first = grossing[0]["name"] if grossing else "—"
        first_artist = grossing[0]["artist"] if grossing else "—"
        summary = f"App Store {c_label} · 游戏类畅销榜第一：{first}（{first_artist}）。"
        digest_lines = [
            f"# App Store · {c_label} ({country.upper()}) · 游戏类",
            "",
            "## 畅销榜 Top 15",
            *[f"{x['rank']}. **{x['name']}** · {x['artist']}" for x in grossing[:15]],
            "",
            "## 免费榜 Top 15",
            *[f"{x['rank']}. **{x['name']}** · {x['artist']}" for x in free[:15]],
        ]
        return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

    return await wrap("appstore", query, body)
