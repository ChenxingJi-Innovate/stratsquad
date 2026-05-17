"""Orchestrator node.

Reads the strategy question + optional user-supplied corpus snippet and produces
4 Subtasks (one per sub-agent). Emits a `plan` event so the UI can render the
expert briefs immediately.
"""
from __future__ import annotations
from langgraph.config import get_stream_writer

from ..agent_runtime import run_json
from ..state import StratSquadState
from ..types import Subtask


PROMPT_TEMPLATE = """你是游戏行业策略团队的 AI 编排器。用户输入了一个战略问题，请把它拆解为 4 个并行的子任务，分别交给 4 个专家 Agent 执行。

子 Agent 名单（固定，不能改名也不能增减）：
1. competitor — 竞品分析专家：拆解相关产品的玩法、商业化、运营节奏、留存表现
2. trend — 行业趋势专家：检索品类整体的市场规模、增长曲线、玩家行为变化、技术驱动力
3. market — 区域市场专家：评估目标地区的购买力、付费习惯、本地化难度、获客渠道
4. risk — 政策风险专家：版号、抽成、地缘政策、平台规则、未成年人保护等合规风险

输出要求：
- 给每个子 Agent 一份 60-120 字的"任务简报"，要具体、可执行、带明确指向
- 简报里要点名应关注的产品 / 地区 / 数据维度
- 不要笼统重复用户的原问题

战略问题：
\"\"\"
{question}
\"\"\"

{corpus_block}

只输出 JSON，schema 严格如下：
{{"subtasks":[
  {{"agent":"competitor","brief":"..."}},
  {{"agent":"trend","brief":"..."}},
  {{"agent":"market","brief":"..."}},
  {{"agent":"risk","brief":"..."}}
]}}"""


async def orchestrator_node(state: StratSquadState) -> dict:
    question = state["question"]
    corpus = (state.get("corpus") or "").strip()
    corpus_block = (
        f'参考语料（用户提供，仅在 trend 简报里酌情引用）：\n"""\n{corpus[:3000]}\n"""\n'
        if corpus else ""
    )

    parsed = await run_json(
        agent="orchestrator",
        prompt=PROMPT_TEMPLATE.format(question=question, corpus_block=corpus_block),
        max_tokens=800,
    )
    raw = parsed.get("subtasks", []) or []
    subtasks = [Subtask(**s) for s in raw if s.get("agent") in {"competitor", "trend", "market", "risk"}]
    if len(subtasks) != 4:
        raise ValueError(f"Orchestrator returned {len(subtasks)} subtasks; expected 4")

    # Emit plan event to UI.
    writer = get_stream_writer()
    writer({"type": "plan", "subtasks": [s.model_dump(by_alias=True) for s in subtasks]})

    return {"plan": subtasks, "retry_round": 0}
