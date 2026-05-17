"""Composer node: integrate 4 sub-agent outputs into a final strategy brief.

Output structure (enforced via prompt):
  1. TL;DR — 3 sentences max
  2. 总体判断 — one chart + 3 bullets
  3. 分平台洞察 — for each trend source we actually queried, one short section + one chart
  4. 综合机会与风险 — table layout
  5. 90 天落地动作 — 5-7 checklist items

Inline charts use a fenced block format the frontend parses:
    ```chart
    {"type": "bar", "title": "...", "data": [{"label": "...", "value": N}]}
    ```
Supported types: bar / pie / line. The frontend renders SVG inline; no chart
library on the wire.
"""
from __future__ import annotations
from langgraph.config import get_stream_writer

from ..agent_runtime import run_streamed
from ..state import StratSquadState
from ..types import TrendDataBundle


def _trend_summary(bundle: TrendDataBundle | None) -> str:
    """Compact list of which sources hit + key numbers — gives composer raw inputs for charts."""
    if not bundle or not bundle.results:
        return "(本轮未采集实时趋势数据)"
    rows = []
    for r in bundle.results:
        if not r.ok:
            continue
        rows.append(f"- {r.label} ({r.source})")
        if r.summary:
            rows.append(f"  {r.summary}")
        if r.datapoints:
            preview = ", ".join(f'"{dp.label}"={dp.value:.0f}' for dp in r.datapoints[:5])
            rows.append(f"  关键数据点: {preview}")
    return "\n".join(rows) if rows else "(所有源均失败)"


PROMPT_TEMPLATE = """你是游戏行业资深策略研究员，需要把 4 位 AI 子 Agent 的输出 + 实时趋势数据合成为一份给高层看的战略简报。

读者画像:
- 资深 PM / 战略总监 / VP 级别
- 时间稀缺,先看结论,有疑问再看依据
- 拒绝长篇累牍,需要可视化辅助判断

战略问题:
\"\"\"
{question}
\"\"\"

实时趋势数据汇总 (你可以基于这些数字做图表):
{trend_summary}

4 位子 Agent 的输出:

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

输出要求 (严格遵守):

1. **不要使用破折号** (— 或 –),用逗号 / 冒号 / 分号代替
2. **中文 markdown**,总字数控制在 **1200-1800 字**,文字 + 图表混排
3. **必须包含至少 2 个图表**,使用以下 JSON fenced 块格式 (前端会解析渲染):

   ```chart
   {{"type":"bar","title":"标题","data":[{{"label":"X1","value":100}},{{"label":"X2","value":80}}]}}
   ```

   - type: "bar" 适合排名/对比, "pie" 适合份额/占比 (data ≤ 6 项,values 加起来通常是 100), "line" 适合时序
   - title 中文短句
   - data 至少 3 项,数值用实时趋势数据里的真实数字 (不要编造)

固定结构 (按这 5 个一级标题输出,不要增减):

# {title_placeholder}

## TL;DR
(2-3 句话:机会强度、时机判断、关键风险)

## 一、总体判断
(150-200 字 + 1 个图表)
- 全市场规模与增长方向
- 中国 / 海外两侧的对比基线
- 关键时机信号
**配图 1**: 用 bar 或 pie 展示本次采集到的最有信号的数据(例如 App Store 各国畅销榜第一名对比 / 中国主流直播平台热度对比)

## 二、分平台洞察
对**本轮实际采集到的每个数据源**,各给 60-100 字的洞察 (省略未采集到的源)。每段格式:
**[源名称]**:
1-2 句话讲这个源里最值得关注的发现,引用 1-2 个具体数字。
如果该平台数据有横向可比性,在该平台段落末尾加一个图表。

## 三、综合机会与风险
分两列对照,各列 3 条 bullet,每条带数字证据:

| 机会 | 风险 |
|------|------|
| 1. ... | 1. ... |
| 2. ... | 2. ... |
| 3. ... | 3. ... |

## 四、90 天落地动作
给 PM 的 5-7 条 actionable checklist:
- [ ] 第 X 周 · 动作 · 负责方向
- [ ] ...

把 title_placeholder 替换成一句话标题,如 "MOBA 在东南亚的 H2 窗口期评估"。"""


async def composer_node(state: StratSquadState) -> dict:
    outputs = state.get("outputs", {}) or {}
    bundle = state.get("trend_bundle")
    prompt = PROMPT_TEMPLATE.format(
        question=state["question"],
        trend_summary=_trend_summary(bundle),
        competitor=outputs.get("competitor", ""),
        trend=outputs.get("trend", ""),
        market=outputs.get("market", ""),
        risk=outputs.get("risk", ""),
        title_placeholder="[这里填一句话标题]",
    )
    content = await run_streamed(agent="composer", prompt=prompt, max_tokens=3500)

    writer = get_stream_writer()
    writer({"type": "brief", "markdown": content})

    return {"brief": content}
