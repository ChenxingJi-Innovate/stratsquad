"""Wikipedia gaming-industry preset RAG corpus.

Curated list of ~30 high-value pages spanning the game industry: companies,
genres, monetization, regional markets, esports. Free, public domain, no
copyright risk.

This file is the ingestion pipeline. Run scripts/build_wiki_preset.py to
fetch + chunk + embed, output → data/preset/wikipedia.json. The output is
committed to the repo so deploys don't need to hit Wikipedia or SiliconFlow
at boot time.
"""
from __future__ import annotations
import asyncio
import json
import re
from pathlib import Path
from typing import Any
import httpx

from ..rag.chunk import chunk_markdown
from ..rag.embed import embed_batched


WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
ZH_WIKIPEDIA_API = "https://zh.wikipedia.org/w/api.php"
UA = "StratSquad/0.2 (https://github.com/ChenxingJi-Innovate/stratsquad; demo) httpx"


# Curated EN + ZH list. ~30 pages, balanced across industry / region / genre / monetization / esports.
PRESET_PAGES_EN: list[str] = [
    # Industry overview
    "Video game industry",
    "Video gaming in China",
    "Video gaming in Japan",
    "Video gaming in South Korea",
    "Video gaming in Southeast Asia",
    # Monetization
    "Free-to-play",
    "Gacha game",
    "Microtransaction",
    "Loot box",
    "Battle pass",
    # Platforms / distribution
    "Mobile game",
    "Steam (service)",
    "Cloud gaming",
    "App Store (Apple)",
    # Genres
    "Multiplayer online battle arena",
    "Battle royale game",
    "Massively multiplayer online game",
    "First-person shooter",
    # Hit games (the "trade press" examples cited by experts)
    "Genshin Impact",
    "Honor of Kings",
    "PUBG Mobile",
    "Mobile Legends: Bang Bang",
    "Arena of Valor",
    "League of Legends",
    # Publishers
    "Tencent",
    "NetEase",
    "MiHoYo",
    "Krafton",
    "Roblox Corporation",
    # Esports
    "Esports",
    "League of Legends World Championship",
]

PRESET_PAGES_ZH: list[str] = [
    "中国电子游戏产业",
    "电子游戏产业",
    "免费游戏",
    "扭蛋游戏",
    "战斗通行证",
    "手机游戏",
    "多人在线战术竞技游戏",
    "原神",
    "王者荣耀",
    "和平精英",
    "腾讯互动娱乐",
    "网易游戏",
    "米哈游",
]


async def fetch_extract(client: httpx.AsyncClient, api: str, title: str) -> dict[str, Any] | None:
    """Fetch one Wikipedia page's plain-text extract."""
    params = {
        "action": "query",
        "prop": "extracts",
        "explaintext": 1,
        "exsectionformat": "plain",
        "titles": title,
        "format": "json",
        "redirects": 1,
    }
    res = await client.get(api, params=params, headers={"User-Agent": UA}, timeout=30)
    if res.status_code != 200:
        return None
    data = res.json()
    pages = (data.get("query") or {}).get("pages") or {}
    for _, page in pages.items():
        if "missing" in page:
            return None
        extract = page.get("extract", "").strip()
        if not extract:
            return None
        # Strip references-style numeric noise + collapse whitespace.
        extract = re.sub(r"\[\d+\]", "", extract)
        extract = re.sub(r"\n{3,}", "\n\n", extract)
        return {
            "title": page.get("title", title),
            "pageid": page.get("pageid"),
            "text": extract,
            "url": f"https://{api.split('//')[1].split('/')[0]}/wiki/{title.replace(' ', '_')}",
            "lang": "en" if api == WIKIPEDIA_API else "zh",
        }
    return None


async def fetch_all_pages() -> list[dict[str, Any]]:
    """Fetch the curated set of EN + ZH Wikipedia pages concurrently."""
    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient() as client:
        tasks_en = [fetch_extract(client, WIKIPEDIA_API, t) for t in PRESET_PAGES_EN]
        tasks_zh = [fetch_extract(client, ZH_WIKIPEDIA_API, t) for t in PRESET_PAGES_ZH]
        results = await asyncio.gather(*tasks_en, *tasks_zh, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                out.append(r)
    return out


def chunk_pages(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Chunk each page into smaller pieces, preserving source attribution."""
    all_chunks: list[dict[str, Any]] = []
    for page in pages:
        # Use the markdown chunker; Wikipedia plaintext works with it.
        # We synthesize a fake "## Heading" line per page so the chunker has a section.
        as_md = f"## {page['title']}\n\n{page['text']}"
        chunks = chunk_markdown(page["title"], as_md)
        for c in chunks:
            all_chunks.append({
                "id": c.id,
                "source": f"wikipedia · {page['title']}",
                "heading": c.heading,
                "text": c.text,
                "url": page["url"],
                "lang": page["lang"],
            })
    return all_chunks


async def build_preset(out_path: Path) -> dict[str, Any]:
    """End-to-end: fetch → chunk → embed → write JSON."""
    print(f"Fetching {len(PRESET_PAGES_EN)} EN + {len(PRESET_PAGES_ZH)} ZH Wikipedia pages …")
    pages = await fetch_all_pages()
    print(f"  got {len(pages)} pages ({sum(1 for p in pages if p['lang']=='en')} EN, {sum(1 for p in pages if p['lang']=='zh')} ZH)")

    chunks = chunk_pages(pages)
    print(f"Chunked into {len(chunks)} chunks (avg {sum(len(c['text']) for c in chunks)//max(1,len(chunks))} chars/chunk)")

    print("Embedding via BGE-M3 (SiliconFlow) …")
    vectors = await embed_batched([c["text"] for c in chunks], batch_size=16)
    print(f"  embedded {len(vectors)} vectors, dim {len(vectors[0]) if vectors else 0}")

    # Pack into UserChunk-compatible shape with persistent client doc ID prefix.
    doc_id = "wiki-gaming"
    user_chunks = [
        {
            "id": f"{doc_id}#{i}",
            "text": c["text"],
            "embedding": vectors[i],
            "source": c["source"],
            "heading": c.get("heading"),
        }
        for i, c in enumerate(chunks)
    ]

    payload = {
        "name": "Wikipedia · 游戏产业",
        "kind": "preset",
        "page_count": len(pages),
        "chunk_count": len(user_chunks),
        "chunks": user_chunks,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}  ({out_path.stat().st_size // 1024} KB)")
    return payload


PRESET_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "preset" / "wikipedia.json"


def load_preset() -> dict[str, Any] | None:
    if not PRESET_PATH.exists():
        return None
    return json.loads(PRESET_PATH.read_text(encoding="utf-8"))
