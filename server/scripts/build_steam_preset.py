"""Build the Steam-top-games preset RAG corpus.

Run from server/:
    uv run python -m scripts.build_steam_preset
"""
from __future__ import annotations
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    if not os.getenv("SILICONFLOW_API_KEY"):
        raise SystemExit("SILICONFLOW_API_KEY not set")
    from stratsquad.preset.steam import build_preset
    await build_preset()


if __name__ == "__main__":
    asyncio.run(main())
