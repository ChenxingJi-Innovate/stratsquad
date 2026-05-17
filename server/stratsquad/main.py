"""FastAPI app: /api/run (multi-agent SSE) + /api/kb/ingest (KB chunk+embed SSE).

Both endpoints stream Server-Sent Events with the same wire format the Next.js
frontend already expects (data: <json>\\n\\n). Auth is handled at the proxy layer
(the Vercel Next.js app forwards through /api/* with the user's session).
"""
from __future__ import annotations
import json
import os
import uuid
from typing import Any, AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from .graph import GRAPH
from .rag.chunk import chunk_markdown
from .rag.embed import embed_batched
from .sse import SSE_HEADERS, to_sse
from .state import StratSquadState
from .types import TrendSource, UserChunk


load_dotenv()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not os.getenv("DEEPSEEK_API_KEY"):
        print("⚠️  DEEPSEEK_API_KEY not set — /api/run will fail.")
    if not os.getenv("SILICONFLOW_API_KEY"):
        print("⚠️  SILICONFLOW_API_KEY not set — RAG retrieval + KB ingest will fail.")
    if os.getenv("LANGSMITH_API_KEY"):
        os.environ.setdefault("LANGSMITH_PROJECT", "stratsquad")
        os.environ.setdefault("LANGSMITH_TRACING", "true")
        print(f"LangSmith tracing enabled → project={os.environ['LANGSMITH_PROJECT']}")
    yield


app = FastAPI(title="StratSquad backend", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "version": "0.2.0"}


# ─── /api/run · multi-agent strategy pipeline ────────────────────────────────
async def _run_stream(payload: dict) -> AsyncIterator[bytes]:
    question = (payload.get("question") or "").strip()
    if not question:
        yield to_sse({"type": "error", "message": "Missing question"})
        return
    state_in: StratSquadState = {
        "question": question,
        "corpus": payload.get("corpus", ""),
        "enabled_sources": payload.get("enabledSources"),
        "user_chunks": [UserChunk.model_validate(c) for c in (payload.get("userChunks") or [])],
    }
    try:
        async for mode, chunk in GRAPH.astream(state_in, stream_mode=["custom"]):
            if mode == "custom":
                yield to_sse(chunk)
        yield to_sse({"type": "complete"})
    except Exception as e:
        yield to_sse({"type": "error", "message": str(e)})


@app.post("/api/run")
async def run_endpoint(req: Request) -> StreamingResponse:
    payload = await req.json()
    return StreamingResponse(_run_stream(payload), headers=SSE_HEADERS)


# ─── /api/kb/ingest · user knowledge-base chunk + embed ──────────────────────
async def _ingest_stream(payload: dict) -> AsyncIterator[bytes]:
    name = payload.get("name") or ""
    text = payload.get("text")
    url = payload.get("url")
    if not name or (not text and not url):
        yield to_sse({"type": "error", "message": "Missing name or text/url"})
        return
    if not os.getenv("SILICONFLOW_API_KEY"):
        yield to_sse({"type": "error", "message": "SILICONFLOW_API_KEY required for embedding"})
        return
    try:
        if url:
            yield to_sse({"type": "chunking", "size": 0})
            import httpx
            from .trends.base import USER_AGENT
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                res = await client.get(url, headers={"User-Agent": USER_AGENT})
                res.raise_for_status()
                raw = res.text
                ctype = res.headers.get("content-type", "")
            if "html" in ctype or raw.lstrip().startswith("<"):
                import re
                raw = re.sub(r"<script[\s\S]*?</script>", "", raw, flags=re.I)
                raw = re.sub(r"<style[\s\S]*?</style>", "", raw, flags=re.I)
                raw = re.sub(r"<[^>]+>", " ", raw)
                raw = re.sub(r"&nbsp;", " ", raw)
                raw = re.sub(r"[ \t]+", " ", raw)
                raw = re.sub(r"\n{3,}", "\n\n", raw).strip()
            text = raw

        yield to_sse({"type": "chunking", "size": len(text)})
        chunks = chunk_markdown(name, text)
        if not chunks:
            yield to_sse({"type": "error", "message": "no chunks produced (text too short or empty)"})
            return

        yield to_sse({"type": "embedding"})
        vectors = await embed_batched([c.text for c in chunks], batch_size=16)
        doc_id = uuid.uuid4().hex[:8]
        user_chunks = [
            UserChunk(
                id=f"{doc_id}#{i}", text=c.text, embedding=vectors[i],
                source=c.source, heading=c.heading,
            )
            for i, c in enumerate(chunks)
        ]
        yield to_sse({
            "type": "ready",
            "chunks": [c.model_dump(by_alias=True, exclude_none=True) for c in user_chunks],
        })
    except Exception as e:
        yield to_sse({"type": "error", "message": str(e)})


@app.post("/api/kb/ingest")
async def kb_ingest_endpoint(req: Request) -> StreamingResponse:
    payload = await req.json()
    return StreamingResponse(_ingest_stream(payload), headers=SSE_HEADERS)
