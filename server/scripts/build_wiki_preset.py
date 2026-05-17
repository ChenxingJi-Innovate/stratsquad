"""Build the Wikipedia gaming-industry preset RAG corpus.

Run from server/:
    uv run python -m scripts.build_wiki_preset

Output: data/preset/wikipedia.json
"""
from __future__ import annotations
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    if not os.getenv("SILICONFLOW_API_KEY"):
        raise SystemExit("SILICONFLOW_API_KEY not set — needed to embed chunks via BGE-M3")
    from stratsquad.preset.wikipedia import build_preset, PRESET_PATH
    await build_preset(PRESET_PATH)


if __name__ == "__main__":
    asyncio.run(main())
