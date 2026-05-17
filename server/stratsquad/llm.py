"""DeepSeek as a LangChain ChatOpenAI.

DeepSeek serves an OpenAI-compatible chat completion API, so we just point ChatOpenAI
at api.deepseek.com. Same trick the JS codebase used; LangChain just makes it cleaner.
"""
from __future__ import annotations
import os
from langchain_openai import ChatOpenAI


DEFAULT_MODEL = "deepseek-v4-flash"


def make_chat(
    *,
    model: str | None = None,
    temperature: float = 0.5,
    max_tokens: int = 2000,
    response_format: str | None = None,
    streaming: bool = True,
) -> ChatOpenAI:
    """Construct a ChatOpenAI wired to DeepSeek. Keep all knobs in one place."""
    kwargs: dict = {
        "model": model or os.getenv("DEEPSEEK_MODEL", DEFAULT_MODEL),
        "temperature": temperature,
        "max_tokens": max_tokens,
        "streaming": streaming,
        "api_key": os.environ["DEEPSEEK_API_KEY"],
        "base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    }
    if response_format == "json":
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    return ChatOpenAI(**kwargs)
