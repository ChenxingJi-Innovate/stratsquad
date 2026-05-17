"""Q&A graph: a single ReAct agent that uses tools to answer focused questions.

Contrast with the strategy graph (lib/graph.py): there we pre-fetch everything
then synthesize across 4 expert agents. Here the agent decides what to query,
when, and stops when it has enough evidence. This is the canonical agentic
pattern — closer to how Claude / GPT use tools in practice.
"""
from __future__ import annotations
from langgraph.prebuilt import create_react_agent

from ..llm import make_chat
from .tools import QA_TOOLS


SYSTEM_PROMPT = """你是游戏产业研究分析师,擅长用证据回答关于游戏市场、品类、发行商、商业化、电竞的具体问题。

你有两个工具:
1. search_corpus — 语义检索游戏产业知识库 (静态语料 + 维基百科预设 2552 段),用于获取背景知识、定义、历史脉络、产品细节
2. query_trend_source — 调用 9 个实时趋势源 (google-trends, steam, twitch, youtube, appstore, huya, douyu, bilibili),用于获取实时数字 (在玩量、观看量、榜单排名)

工作原则:
- **先想清楚再调用工具**。说明你为什么调这个工具、期待什么。
- **每个论点都要有证据**。引用工具返回的具体段落或数字。在引用句尾标 [#N] 编号。
- **不要凭训练记忆答事实性问题**。任何数字、产品名、公司信息,先用工具验证。
- **跨区域问题必带中国维度**。中国市场问题必调 appstore region=cn + huya/douyu/bilibili 至少一个。
- **答完整再停**。如果一个工具调用不够,继续调下一个。但避免无意义的重复调用。
- **最终回答用中文 markdown**,800-1500 字。先一句话答案,再展开论据,最后给行动建议或下一步研究方向。

不要使用破折号 (— 或 –)。引用工具返回时保留来源标注。"""


_GRAPH = None


def build_qa_graph():
    """Compile a ReAct agent with our 2 tools. Lazy so DEEPSEEK_API_KEY isn't
    required at import time (matters for `python -c` smoke tests + Modal cold start)."""
    global _GRAPH
    if _GRAPH is None:
        model = make_chat(
            temperature=0.3,
            max_tokens=4000,
            streaming=True,
        ).bind_tools(QA_TOOLS)
        _GRAPH = create_react_agent(model=model, tools=QA_TOOLS, prompt=SYSTEM_PROMPT)
    return _GRAPH
