"""Reddit OAuth2 client_credentials → posts search."""
from __future__ import annotations
import base64
import os
import time
import httpx

from ..types import TrendQuery, TrendDatapoint, TrendResult
from .base import wrap, fmt_num


_token_cache: dict | None = None


async def _get_token() -> str:
    global _token_cache
    cid = os.getenv("REDDIT_CLIENT_ID")
    secret = os.getenv("REDDIT_CLIENT_SECRET")
    if not cid or not secret:
        raise RuntimeError("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set")
    if _token_cache and time.time() < _token_cache["expires_at"]:
        return _token_cache["token"]
    ua = os.getenv("REDDIT_USER_AGENT", "stratsquad/0.1")
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            "https://www.reddit.com/api/v1/access_token",
            headers={"Authorization": f"Basic {basic}", "User-Agent": ua, "Content-Type": "application/x-www-form-urlencoded"},
            content="grant_type=client_credentials",
        )
        res.raise_for_status()
        tk = res.json()
    _token_cache = {"token": tk["access_token"], "expires_at": time.time() + tk["expires_in"] - 60}
    return tk["access_token"]


async def fetch_reddit(query: TrendQuery) -> TrendResult:
    async def body() -> dict:
        subs = (query.subreddits or [])[:5]
        keywords = (query.keywords or [])[:3]
        if not subs and not keywords:
            raise ValueError("no subreddits or keywords")
        token = await _get_token()
        ua = os.getenv("REDDIT_USER_AGENT", "stratsquad/0.1")
        headers = {"Authorization": f"Bearer {token}", "User-Agent": ua}

        all_posts = []
        per_sub: dict = {}
        targets = subs if subs else [""]
        q = " OR ".join(keywords) if keywords else (subs[0] if subs else "")
        async with httpx.AsyncClient(timeout=15) as client:
            for sub in targets:
                path = f"/r/{sub}/search" if sub else "/search"
                url = f"https://oauth.reddit.com{path}?q={q}&restrict_sr={1 if sub else 0}&sort=top&t=month&limit=25"
                try:
                    res = await client.get(url, headers=headers)
                    if res.status_code != 200:
                        continue
                    posts = [c["data"] for c in (res.json().get("data") or {}).get("children", [])]
                    for p in posts:
                        all_posts.append(p)
                        k = p["subreddit"]
                        per_sub.setdefault(k, {"posts": 0, "total_score": 0, "total_comments": 0})
                        per_sub[k]["posts"] += 1
                        per_sub[k]["total_score"] += p["score"]
                        per_sub[k]["total_comments"] += p["num_comments"]
                except Exception:
                    continue
        if not all_posts:
            raise ValueError("no posts")
        top_posts = sorted(all_posts, key=lambda p: p["score"], reverse=True)[:5]
        datapoints = [
            TrendDatapoint(label=f"r/{sub}", value=float(agg["total_score"]),
                           meta={"posts": agg["posts"], "comments": agg["total_comments"]})
            for sub, agg in per_sub.items()
        ]
        label_join = "/".join(subs) if subs else "/".join(keywords)
        summary = f"Reddit 近 30 天 {label_join} 热度：共抓 {len(all_posts)} 帖，最高分 {top_posts[0]['score']}。"
        digest_lines = [
            f"# Reddit · 近 30 天 · " + (" · ".join("r/" + s for s in subs) if subs else " · ".join(keywords)),
            "",
            "## 子版聚合",
        ]
        for sub, agg in per_sub.items():
            digest_lines.append(f"- **r/{sub}** · {agg['posts']} 帖 · 总分 {fmt_num(agg['total_score'])} · 总评论 {fmt_num(agg['total_comments'])}")
        digest_lines += ["", "## 热帖前 5"]
        for i, p in enumerate(top_posts):
            digest_lines.append(f"{i+1}. r/{p['subreddit']} · {p['score']} 分 · {p['num_comments']} 评论 · {p['title'][:80]}")
        return {"summary": summary, "digest": "\n".join(digest_lines), "datapoints": datapoints}

    return await wrap("reddit", query, body)
