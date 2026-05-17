"""Composer node: integrate 4 sub-agent outputs into a final strategy brief."""
from __future__ import annotations
from langgraph.config import get_stream_writer

from ..agent_runtime import run_streamed
from ..state import StratSquadState


PROMPT_TEMPLATE = """你是游戏策略团队的高级研究员，需要把 4 位 AI 子 Agent 的输出合成为一份给高层看的"战略简报"。

要求：
- 不是简单拼接，要做信息整合、去重、矛盾化解
- 第一段是 TL;DR：3-4 句话给出核心结论 (机会 / 时机 / 路径 / 风险)
- 后面用 6 个有序章节展开，每章带具体数据和动作建议
- 中文，markdown 格式
- 不要使用破折号 (— 或 –)
- 字数 1200-1800

战略问题：
\"\"\"
{question}
\"\"\"

子 Agent 输出：

## 竞品分析
\"\"\"
{competitor}
\"\"\"

## 行业趋势
\"\"\"
{trend}
\"\"\"

## 区域市场
\"\"\"
{market}
\"\"\"

## 政策风险
\"\"\"
{risk}
\"\"\"

固定模板 (严格按这 7 个一级标题输出，不要增减)：

# 战略简报：[这里填一句话标题]

## TL;DR
(3-4 句核心结论)

## 1. 机会判断
(结合趋势 + 市场，给出"是否值得做"的明确答复 + 论据)

## 2. 竞品启示
(从竞品拆解中提取 3 条可迁移机制)

## 3. 目标用户与区域
(画像 + 区域优先级)

## 4. 商业化与运营
(ARPU 区间 + 付费墙位置 + 运营节奏建议)

## 5. 风险与应对
(高 / 中 / 低风险各 1 条 + 具体缓解动作)

## 6. 90 天落地动作
(给 PM 的 5-7 条 actionable checklist，每条带负责方向)"""


async def composer_node(state: StratSquadState) -> dict:
    outputs = state.get("outputs", {}) or {}
    prompt = PROMPT_TEMPLATE.format(
        question=state["question"],
        competitor=outputs.get("competitor", ""),
        trend=outputs.get("trend", ""),
        market=outputs.get("market", ""),
        risk=outputs.get("risk", ""),
    )
    content = await run_streamed(agent="composer", prompt=prompt, max_tokens=3000)

    writer = get_stream_writer()
    writer({"type": "brief", "markdown": content})

    return {"brief": content}
