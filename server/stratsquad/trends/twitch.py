"""Twitch Helix — needs TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET."""
from __future__ import annotations
import os
import time
import httpx

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fetch_json, fmt_num


_token_cache: dict | None = None


async def _get_token() -> str:
    global _token_cache
    cid = os.getenv("TWITCH_CLIENT_ID")
    secret = os.getenv("TWITCH_CLIENT_SECRET")
    if not cid or not secret:
        raise RuntimeError("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set")
    if _token_cache and time.time() < _token_cache["expires_at"]:
        return _token_cache["token"]
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"https://id.twitch.tv/oauth2/token?client_id={cid}&client_secret={secret}&grant_type=client_credentials"
        )
        res.raise_for_status()
        tk = res.json()
    _token_cache = {"token": tk["access_token"], "expires_at": time.time() + tk["expires_in"] - 60}
    return tk["access_token"]


async def fetch_twitch(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        token = await _get_token()
        cid = os.environ["TWITCH_CLIENT_ID"]
        headers = {"Client-Id": cid, "Authorization": f"Bearer {token}"}
        titles = query.game_titles or []

        if not titles:
            top = await fetch_json("https://api.twitch.tv/helix/games/top?first=10", headers=headers)
            games = top.get("data", [])
            if not games:
                raise ValueError("empty top list")
            rows = []
            for g in games:
                streams = await fetch_json(
                    f"https://api.twitch.tv/helix/streams?game_id={g['id']}&first=100",
                    headers=headers,
                )
                total = sum(s["viewer_count"] for s in streams.get("data", []))
                rows.append({"name": g["name"], "viewers": total, "streams": len(streams.get("data", []))})
            rows.sort(key=lambda r: r["viewers"], reverse=True)
            datapoints = [TrendDatapoint(label=r["name"], value=float(r["viewers"]), meta={"streams": r["streams"]}) for r in rows]
            summary = f"Twitch 当前观众数 Top 10，{rows[0]['name']} 领先（{fmt_num(rows[0]['viewers'])} 观众）。"
            digest = "# Twitch · 当前观众数 Top 10\n\n" + "\n".join(
                f"{i+1}. **{r['name']}** · {fmt_num(r['viewers'])} 观众 · {fmt_num(r['streams'])} 路直播"
                for i, r in enumerate(rows)
            )
            return {"summary": summary, "digest": digest, "datapoints": datapoints}

        rows = []
        for t in titles[:5]:
            try:
                g = await fetch_json(f"https://api.twitch.tv/helix/games?name={t}", headers=headers)
                game_id = (g.get("data") or [{}])[0].get("id")
                if not game_id:
                    continue
                streams = await fetch_json(
                    f"https://api.twitch.tv/helix/streams?game_id={game_id}&first=100",
                    headers=headers,
                )
                total = sum(s["viewer_count"] for s in streams.get("data", []))
                rows.append({"name": g["data"][0]["name"], "viewers": total, "streams": len(streams.get("data", []))})
            except Exception:
                continue
        if not rows:
            raise ValueError("no games resolved")
        datapoints = [TrendDatapoint(label=r["name"], value=float(r["viewers"]), meta={"streams": r["streams"]}) for r in rows]
        summary = "Twitch：" + "；".join(f"{r['name']} {fmt_num(r['viewers'])} 观众" for r in rows) + "。"
        digest = "# Twitch · 指定游戏直播热度\n\n" + "\n".join(
            f"- **{r['name']}** · {fmt_num(r['viewers'])} 当前观众 · {fmt_num(r['streams'])} 路直播" for r in rows
        )
        return {"summary": summary, "digest": digest, "datapoints": datapoints}

    return await wrap("twitch", query, body)
