"""Steam top-games store-page preset RAG corpus.

Complements the Wikipedia preset (industry overview, definitions, history)
with "what specific games actually do" — store-page descriptions, genre +
category tags, features. Pulled from the public Steam storefront API
(no key required for the appdetails endpoint).

Curated list of ~45 games across categories. Selection criteria: high-recognition
titles strategists actually reference (MOBA / FPS / BR / RPG / survival / indie
hit / 4X / sim) with substantive store-page text.
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


STEAM_APPDETAILS = "https://store.steampowered.com/api/appdetails"

# (appid, friendly-name-fallback). Friendly fallback used if Steam returns no data.
CURATED_APPS: list[tuple[int, str]] = [
    # MOBA / arena
    (570,     "Dota 2"),
    (386360,  "Smite"),
    # Battle Royale / shooter
    (578080,  "PUBG: BATTLEGROUNDS"),
    (1172470, "Apex Legends"),
    (1203220, "Naraka: Bladepoint"),
    (553850,  "HELLDIVERS 2"),
    # FPS / tactical
    (730,     "Counter-Strike 2"),
    (359550,  "Tom Clancy's Rainbow Six Siege"),
    (1962663, "Call of Duty"),
    # Survival / sandbox / coop
    (346110,  "ARK: Survival Evolved"),
    (252490,  "Rust"),
    (892970,  "Valheim"),
    (1623730, "Palworld"),
    # RPG / open world
    (1245620, "ELDEN RING"),
    (1091500, "Cyberpunk 2077"),
    (1086940, "Baldur's Gate 3"),
    (292030,  "The Witcher 3: Wild Hunt"),
    (489830,  "The Elder Scrolls V: Skyrim Special Edition"),
    (814380,  "Sekiro: Shadows Die Twice"),
    (1145360, "Hades"),
    # MMORPG / live service
    (1599340, "Lost Ark"),
    (582660,  "Black Desert"),
    # Strategy / 4X
    (1158310, "Crusader Kings III"),
    (1142710, "Total War: WARHAMMER III"),
    (1466860, "Age of Empires IV"),
    (236850,  "Europa Universalis IV"),
    # Indie hits
    (367520,  "Hollow Knight"),
    (413150,  "Stardew Valley"),
    (1794680, "Vampire Survivors"),
    (646570,  "Slay the Spire"),
    (2379780, "Balatro"),
    (322330,  "Don't Starve Together"),
    (438100,  "VRChat"),
    # Multiplayer party / coop
    (105600,  "Terraria"),
    (945360,  "Among Us"),
    (1097150, "Fall Guys"),
    # PvPvE looter / extraction
    (1517290, "Battlefield 2042"),
    (1100600, "Hunt: Showdown 1896"),
    # Sim / racing
    (8930,    "Sid Meier's Civilization V"),
    (1142710, "Total War: WARHAMMER III"),
    (1716740, "Starfield"),
    # Mobile-style on PC
    (3164500, "Marvel Rivals"),
]


def _strip_html(s: str) -> str:
    s = re.sub(r"<script[\s\S]*?</script>", "", s, flags=re.IGNORECASE)
    s = re.sub(r"<style[\s\S]*?</style>", "", s, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"&amp;", "&", s)
    s = re.sub(r"&lt;", "<", s)
    s = re.sub(r"&gt;", ">", s)
    s = re.sub(r"&quot;", '"', s)
    s = re.sub(r"&#39;", "'", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


async def fetch_app(client: httpx.AsyncClient, appid: int) -> dict[str, Any] | None:
    try:
        res = await client.get(
            STEAM_APPDETAILS,
            params={"appids": appid, "l": "english", "cc": "us"},
            timeout=20,
        )
        if res.status_code != 200:
            return None
        data = res.json().get(str(appid)) or {}
        if not data.get("success"):
            return None
        d = data.get("data") or {}
        name = d.get("name") or ""
        short_desc = _strip_html(d.get("short_description") or "")
        about = _strip_html(d.get("about_the_game") or "")
        detailed = _strip_html(d.get("detailed_description") or "")
        genres = [g.get("description") for g in d.get("genres", []) if g.get("description")]
        categories = [c.get("description") for c in d.get("categories", []) if c.get("description")]
        developers = d.get("developers", [])
        publishers = d.get("publishers", [])
        release = (d.get("release_date") or {}).get("date") or ""
        # Compose a single markdown doc
        parts: list[str] = [f"## {name}"]
        if release:
            parts.append(f"**发行**: {release}")
        if developers or publishers:
            parts.append(f"**开发商 / 发行商**: {' · '.join(developers)} / {' · '.join(publishers)}")
        if genres:
            parts.append(f"**Genres**: {', '.join(genres)}")
        if categories:
            parts.append(f"**Categories**: {', '.join(categories[:8])}")
        if short_desc:
            parts.append(f"\n{short_desc}")
        if about and about != short_desc:
            parts.append(f"\n{about}")
        elif detailed:
            parts.append(f"\n{detailed[:3000]}")
        text = "\n\n".join(parts)
        return {
            "title": name,
            "appid": appid,
            "text": text,
            "url": f"https://store.steampowered.com/app/{appid}",
        }
    except Exception:
        return None


async def fetch_all() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    # Sequential with a short delay — Steam's storefront API rate-limits parallel hits.
    async with httpx.AsyncClient() as client:
        for appid, _name in CURATED_APPS:
            page = await fetch_app(client, appid)
            if page:
                out.append(page)
            await asyncio.sleep(0.3)
    return out


def chunk_pages(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    all_chunks: list[dict[str, Any]] = []
    for page in pages:
        chunks = chunk_markdown(page["title"], page["text"])
        for c in chunks:
            all_chunks.append({
                "id": c.id,
                "source": f"steam · {page['title']}",
                "heading": c.heading,
                "text": c.text,
                "url": page["url"],
            })
    return all_chunks


PRESET_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "preset" / "steam-games.json"


async def build_preset(out_path: Path = PRESET_PATH) -> dict[str, Any]:
    print(f"Fetching {len(CURATED_APPS)} Steam pages …")
    pages = await fetch_all()
    print(f"  got {len(pages)} pages")

    chunks = chunk_pages(pages)
    print(f"Chunked into {len(chunks)} chunks (avg {sum(len(c['text']) for c in chunks)//max(1,len(chunks))} chars/chunk)")

    print("Embedding via BGE-M3 (SiliconFlow) …")
    vectors = await embed_batched([c["text"] for c in chunks], batch_size=16)
    print(f"  embedded {len(vectors)} vectors, dim {len(vectors[0]) if vectors else 0}")

    doc_id = "steam-games"
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
        "name": "Steam · 头部游戏产品页",
        "kind": "preset",
        "page_count": len(pages),
        "chunk_count": len(user_chunks),
        "chunks": user_chunks,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}  ({out_path.stat().st_size // 1024} KB)")
    return payload
