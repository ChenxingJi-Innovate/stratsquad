"""Lazy in-memory load of the static corpus embeddings."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Optional


_STORE_CACHE: Optional[list[dict]] = None
_DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "embeddings.json"


def load_store() -> list[dict]:
    """Return the embedded chunks list. Loads once, then memoized."""
    global _STORE_CACHE
    if _STORE_CACHE is None:
        if _DATA_PATH.exists():
            with _DATA_PATH.open("r", encoding="utf-8") as f:
                _STORE_CACHE = json.load(f)
        else:
            _STORE_CACHE = []
    return _STORE_CACHE
