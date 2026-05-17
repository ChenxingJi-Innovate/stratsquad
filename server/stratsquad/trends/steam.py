"""Steam — Steam Web API + storefront search. No key needed for the endpoints we use."""
from __future__ import annotations

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json, fmt_num


async def fetch_steam(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        titles = query.game_titles or []
        if not titles:
            top = await fetch_json(
                "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/"
            )
            ranks = (top.get("response") or {}).get("ranks", [])[:10]
            if not ranks:
                raise ValueError("empty rank list")
            names: dict[int, str] = {}
            for r in ranks[:5]:
                try:
                    ad = await fetch_json(
                        f"https://store.steampowered.com/api/appdetails?appids={r['appid']}&filters=basic&cc=us"
                    )
                    names[r["appid"]] = (ad.get(str(r["appid"])) or {}).get("data", {}).get("name", f"appid {r['appid']}")
                except Exception:
                    names[r["appid"]] = f"appid {r['appid']}"
            datapoints = [
                TrendDatapoint(
                    label=names.get(r["appid"], f"appid {r['appid']}"),
                    value=float(r["concurrent_in_game"]),
                    meta={"peak": r["peak_in_game"], "rank": r["rank"]},
                )
                for r in ranks
            ]
            first = names.get(ranks[0]["appid"], "unknown")
            summary = f"Steam 当前在玩量 Top 10，第一名 {first} 当前 {fmt_num(ranks[0]['concurrent_in_game'])} 人在玩。"
            digest_lines = ["# Steam · 当前在玩量 Top 10", ""]
            for i, r in enumerate(ranks):
                digest_lines.append(
                    f"{i+1}. **{names.get(r['appid'], 'appid '+str(r['appid']))}** · 当前 {fmt_num(r['concurrent_in_game'])} · 24h 峰值 {fmt_num(r['peak_in_game'])}"
                )
            return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

        results = []
        for t in titles[:5]:
            try:
                search = await fetch_json(
                    f"https://store.steampowered.com/api/storesearch?term={t}&cc=us"
                )
                top = (search.get("items") or [None])[0]
                if not top:
                    continue
                pc = await fetch_json(
                    f"https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={top['id']}"
                )
                players = ((pc.get("response") or {}).get("player_count")) or 0
                results.append({"title": t, "name": top["name"], "appid": top["id"], "players": players})
            except Exception:
                continue
        if not results:
            raise ValueError("no titles resolved")
        datapoints = [
            TrendDatapoint(label=r["name"], value=float(r["players"]), meta={"appid": r["appid"]})
            for r in results
        ]
        summary = "Steam 当前在玩量：" + "；".join(f"{r['name']} {fmt_num(r['players'])}" for r in results) + "。"
        digest = "# Steam · 指定游戏在玩量\n\n" + "\n".join(
            f"- **{r['name']}** (appid {r['appid']}) · 当前在玩 {fmt_num(r['players'])} 人" for r in results
        )
        return {"summary": summary, "digest": digest, "datapoints": datapoints}

    return await wrap("steam", query, body)
