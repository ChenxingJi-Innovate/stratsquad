"""BGE-M3 embedding via SiliconFlow's OpenAI-compatible endpoint."""
from __future__ import annotations
import os
from typing import Optional
import httpx


EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-m3")
EMBED_DIM = 1024
BASE = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")


async def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    key = os.getenv("SILICONFLOW_API_KEY")
    if not key:
        raise RuntimeError("SILICONFLOW_API_KEY not set")

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{BASE}/embeddings",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": EMBED_MODEL, "input": texts, "encoding_format": "float"},
        )
        res.raise_for_status()
        data = res.json()["data"]

    out: list[Optional[list[float]]] = [None] * len(texts)
    for row in data:
        out[row["index"]] = row["embedding"]
    return [v for v in out if v is not None]


async def embed_batched(texts: list[str], batch_size: int = 16) -> list[list[float]]:
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        out.extend(await embed(texts[i:i + batch_size]))
    return out
