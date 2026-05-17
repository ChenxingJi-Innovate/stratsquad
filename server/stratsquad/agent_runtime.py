"""Streaming + JSON-mode helpers used by every graph node.

Wraps DeepSeek (LangChain ChatOpenAI) and emits SSE-compatible custom events via the
LangGraph stream writer so the frontend can render agent_start / agent_token /
agent_done identical to the old TS pipeline.
"""
from __future__ import annotations
import json
import re
from typing import Optional
from langchain_core.messages import HumanMessage, SystemMessage, AIMessageChunk
from langgraph.config import get_stream_writer

from .llm import make_chat
from .types import AgentName


def safe_parse_json(raw: str) -> dict:
    """DeepSeek occasionally wraps JSON in ```json fences despite response_format. Strip them."""
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned)
    return json.loads(cleaned)


async def run_streamed(
    *,
    agent: AgentName,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 2000,
    json_mode: bool = False,
    silent: bool = False,
) -> str:
    """Stream a DeepSeek call as a graph node. Emits SSE custom events.

    silent=True skips writer emissions; used for sub-orchestration steps (e.g. the
    trend planner) that we don't want to show as a separate agent in the UI timeline.
    """
    writer = get_stream_writer() if not silent else None
    if writer:
        writer({"type": "agent_start", "agent": agent})

    chat = make_chat(
        max_tokens=max_tokens,
        response_format="json" if json_mode else None,
        streaming=not json_mode,
    )
    messages = []
    if system:
        messages.append(SystemMessage(content=system))
    messages.append(HumanMessage(content=prompt))

    buffer = ""
    if json_mode:
        # JSON mode: one-shot. response_format=json_object guarantees parseable JSON.
        resp = await chat.ainvoke(messages)
        buffer = resp.content if isinstance(resp.content, str) else str(resp.content)
    else:
        async for chunk in chat.astream(messages):
            delta = chunk.content if isinstance(chunk, AIMessageChunk) else ""
            if isinstance(delta, list):
                delta = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in delta)
            if delta:
                buffer += delta
                if writer:
                    writer({"type": "agent_token", "agent": agent, "delta": delta})

    if writer:
        writer({"type": "agent_done", "agent": agent, "content": buffer})
    return buffer


async def run_json(**kwargs) -> dict:
    """Same as run_streamed but parses JSON at the end."""
    text = await run_streamed(json_mode=True, **kwargs)
    return safe_parse_json(text)
