"""SSE helpers.

FastAPI returns a StreamingResponse over text/event-stream. Each event is a single
`data: <json>\n\n` line so the frontend's `buf.split('\n\n')` parser keeps working
unchanged from when this was emitted by the Node /api/run route.
"""
from __future__ import annotations
import json
from typing import AsyncIterator, Any


SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def to_sse(event: Any) -> bytes:
    """Serialize one event dict to SSE wire bytes."""
    if hasattr(event, "model_dump"):
        payload = event.model_dump(by_alias=True, exclude_none=True)
    else:
        payload = event
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


async def merge_streams(*iterables: AsyncIterator[Any]) -> AsyncIterator[Any]:
    """Fan-in helper: yield items from multiple async iterators as they arrive.

    LangGraph's astream() is one source; per-source trend fetch tasks are another;
    we sometimes need to interleave both into the outgoing SSE stream.
    """
    import asyncio
    queue: asyncio.Queue = asyncio.Queue()
    DONE = object()

    async def pump(it: AsyncIterator[Any]) -> None:
        async for item in it:
            await queue.put(item)
        await queue.put(DONE)

    tasks = [asyncio.create_task(pump(it)) for it in iterables]
    open_count = len(tasks)
    try:
        while open_count > 0:
            item = await queue.get()
            if item is DONE:
                open_count -= 1
            else:
                yield item
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()
