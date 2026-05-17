"""Preset corpus registry. Each preset is a server-side JSON file of embedded
chunks; clients opt in by ID. Chunks never travel from server → client.
"""
from __future__ import annotations
import json
from pathlib import Path
from functools import lru_cache

from ..types import UserChunk, PresetInfo


_DATA = Path(__file__).resolve().parent.parent.parent / "data" / "preset"


PRESET_MANIFEST: dict[str, dict] = {
    "wikipedia": {
        "name": "Wikipedia · 游戏产业",
        "description": "40 篇 EN + ZH 维基百科条目,覆盖品类、商业化、区域市场、头部产品、电竞、发行商。",
        "file": "wikipedia.json",
    },
}


def list_presets() -> list[PresetInfo]:
    """Lightweight manifest (no chunks) for the frontend to render the picker."""
    out: list[PresetInfo] = []
    for preset_id, m in PRESET_MANIFEST.items():
        path = _DATA / m["file"]
        if not path.exists():
            continue
        try:
            meta = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append(PresetInfo(
            id=preset_id,
            name=m["name"],
            description=m["description"],
            page_count=int(meta.get("page_count", 0)),
            chunk_count=int(meta.get("chunk_count", 0)),
        ))
    return out


@lru_cache(maxsize=4)
def load_preset_chunks(preset_id: str) -> list[UserChunk]:
    """Load a preset's embedded chunks. Memoized so we only read disk once per process."""
    m = PRESET_MANIFEST.get(preset_id)
    if not m:
        return []
    path = _DATA / m["file"]
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return [UserChunk.model_validate(c) for c in data.get("chunks", [])]
