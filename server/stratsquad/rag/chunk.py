"""CJK-aware markdown chunker. Matches the TS lib/rag/chunk.ts behavior."""
from __future__ import annotations
import re
from dataclasses import dataclass


TARGET = 420
OVERLAP = 60
MAX = 600


@dataclass
class Chunk:
    id: str
    source: str
    heading: str | None
    text: str
    start_char: int
    end_char: int


def _split_to_chunks(text: str) -> list[str]:
    out: list[str] = []
    cursor = 0
    n = len(text)
    while cursor < n:
        remaining = n - cursor
        if remaining <= MAX:
            out.append(text[cursor:])
            break
        win_start = cursor + TARGET
        win_end = min(cursor + MAX, n)
        window = text[win_start:win_end]
        cut = -1
        i = window.find("\n\n")
        if i >= 0:
            cut = i + 2
        if cut < 0:
            m = re.search(r"[。！？!?]", window)
            if m:
                cut = m.end()
        if cut < 0:
            m = re.search(r"[，；,;]", window)
            if m:
                cut = m.end()
        if cut < 0:
            cut = len(window)
        end = win_start + cut
        out.append(text[cursor:end])
        cursor = max(end - OVERLAP, cursor + 1)
    return [s.strip() for s in out if len(s.strip()) >= 40]


def chunk_markdown(source: str, raw: str) -> list[Chunk]:
    lines = raw.split("\n")
    sections: list[dict] = []
    current_heading: str | None = None
    current_body: list[str] = []
    running_offset = 0
    section_start = 0

    def flush() -> None:
        nonlocal current_body
        body = "\n".join(current_body).strip()
        if body:
            sections.append({"heading": current_heading, "text": body, "offset": section_start})
        current_body = []

    for line in lines:
        line_len = len(line) + 1
        if re.match(r"^##\s+", line):
            flush()
            current_heading = re.sub(r"^##\s+", "", line).strip()
            section_start = running_offset + line_len
        elif re.match(r"^#\s+", line):
            flush()
            current_heading = None
            section_start = running_offset + line_len
        else:
            if not current_body:
                section_start = running_offset
            current_body.append(line)
        running_offset += line_len
    flush()

    chunks: list[Chunk] = []
    idx = 0
    for sec in sections:
        parts = _split_to_chunks(sec["text"])
        for part in parts:
            local = sec["text"].find(part)
            abs_start = sec["offset"] + local if local >= 0 else sec["offset"]
            chunks.append(Chunk(
                id=f"{source}#{idx}",
                source=source,
                heading=sec["heading"],
                text=part,
                start_char=abs_start,
                end_char=abs_start + len(part),
            ))
            idx += 1
    return chunks
