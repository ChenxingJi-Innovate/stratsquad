"""Judge node: 4-dim rubric scoring + retry decision.

Always recomputes total + verdict server-side so the model can't fudge the math.
Emits a `judge` event with the final scores.
"""
from __future__ import annotations
from langgraph.config import get_stream_writer

from ..agent_runtime import run_json
from ..state import StratSquadState
from ..types import JudgeScore, JUDGE_PASS_THRESHOLD


SUB_AGENT_ORDER = ("competitor", "trend", "market", "risk")


async def judge_node(state: StratSquadState) -> dict:
    outputs = state.get("outputs", {}) or {}
    prompt = f"""你是游戏策略总监，负责评审 4 位 AI 子 Agent 的输出质量。

评分维度 (每项 0-100)：
- evidence (证据充分性)：是否引用具体产品 / 数据 / 案例，而不是空话
- logic (逻辑严密性)：论证链是否成立，因果是否清楚
- actionability (可执行性)：PM 看完后能不能直接 take action
- novelty (新颖度)：是否超出常识，给出非显然的洞察

通过线 = {JUDGE_PASS_THRESHOLD} (weighted total)。低于通过线判 "retry"，等于或高于判 "pass"。

权重：evidence 0.35, logic 0.25, actionability 0.30, novelty 0.10。

每个 Agent 给一个 1-2 句的 reason，要点出具体扣分项 (例："缺乏 ARPU 区间数字" / "竞品列表中没有 PUBG Mobile")。

四份输出：

## competitor
\"\"\"
{outputs.get('competitor', '')}
\"\"\"

## trend
\"\"\"
{outputs.get('trend', '')}
\"\"\"

## market
\"\"\"
{outputs.get('market', '')}
\"\"\"

## risk
\"\"\"
{outputs.get('risk', '')}
\"\"\"

只输出 JSON，schema 严格如下：
{{"scores":[
  {{"agent":"competitor","evidence":0,"logic":0,"actionability":0,"novelty":0,"total":0,"verdict":"pass","reason":"..."}},
  {{"agent":"trend","evidence":0,"logic":0,"actionability":0,"novelty":0,"total":0,"verdict":"pass","reason":"..."}},
  {{"agent":"market","evidence":0,"logic":0,"actionability":0,"novelty":0,"total":0,"verdict":"pass","reason":"..."}},
  {{"agent":"risk","evidence":0,"logic":0,"actionability":0,"novelty":0,"total":0,"verdict":"pass","reason":"..."}}
]}}"""

    parsed = await run_json(agent="judge", prompt=prompt, max_tokens=1500)
    raw = parsed.get("scores", []) or []

    # Recompute total + verdict so the model can't lie.
    fixed: list[JudgeScore] = []
    by_agent = {s["agent"]: s for s in raw if isinstance(s, dict)}
    for name in SUB_AGENT_ORDER:
        s = by_agent.get(name)
        if not s:
            continue
        total = round(
            s.get("evidence", 0) * 0.35
            + s.get("logic", 0) * 0.25
            + s.get("actionability", 0) * 0.30
            + s.get("novelty", 0) * 0.10
        )
        fixed.append(JudgeScore(
            agent=name,
            evidence=int(s.get("evidence", 0)),
            logic=int(s.get("logic", 0)),
            actionability=int(s.get("actionability", 0)),
            novelty=int(s.get("novelty", 0)),
            total=total,
            verdict="pass" if total >= JUDGE_PASS_THRESHOLD else "retry",
            reason=str(s.get("reason", "")),
        ))

    # Emit to UI.
    writer = get_stream_writer()
    writer({"type": "judge", "scores": [s.model_dump(by_alias=True) for s in fixed]})

    return {"scores": fixed}
