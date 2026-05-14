import { runJSON } from './_run'
import { JUDGE_PASS_THRESHOLD, type JudgeScore, type SubAgent } from '../types'
import type { SSEWriter } from '../stream'

export async function runJudge(outputs: Record<SubAgent, string>, sse: SSEWriter): Promise<JudgeScore[]> {
  const prompt = `你是天美策略总监，负责评审 4 位 AI 子 Agent 的输出质量。

评分维度 (每项 0-100)：
- evidence (证据充分性)：是否引用具体产品 / 数据 / 案例，而不是空话
- logic (逻辑严密性)：论证链是否成立，因果是否清楚
- actionability (可执行性)：天美的 PM 看完后能不能直接 take action
- novelty (新颖度)：是否超出常识，给出非显然的洞察

通过线 = ${JUDGE_PASS_THRESHOLD} (weighted total)。低于通过线判 "retry"，等于或高于判 "pass"。

权重：evidence 0.35, logic 0.25, actionability 0.30, novelty 0.10。

每个 Agent 给一个 1-2 句的 reason，要点出具体扣分项 (例："缺乏 ARPU 区间数字" / "竞品列表中没有 PUBG Mobile")。

四份输出：

## competitor
"""
${outputs.competitor}
"""

## trend
"""
${outputs.trend}
"""

## market
"""
${outputs.market}
"""

## risk
"""
${outputs.risk}
"""

只输出 JSON，schema 严格如下：
{"scores":[
  {"agent":"competitor","evidence":0,"logic":0,"actionability":0,"novelty":0,"total":0,"verdict":"pass","reason":"..."},
  {"agent":"trend",...},
  {"agent":"market",...},
  {"agent":"risk",...}
]}`

  const parsed = await runJSON<{ scores: JudgeScore[] }>({
    agent: 'judge',
    prompt,
    sse,
    maxTokens: 1500,
  })

  // Defensively recompute total + verdict in case the model fudged the math.
  const scores = (parsed.scores ?? []).map(s => {
    const total = Math.round(s.evidence * 0.35 + s.logic * 0.25 + s.actionability * 0.30 + s.novelty * 0.10)
    return { ...s, total, verdict: total >= JUDGE_PASS_THRESHOLD ? ('pass' as const) : ('retry' as const) }
  })

  // Order by the canonical sub-agent order so the UI rows stay stable.
  const order: SubAgent[] = ['competitor', 'trend', 'market', 'risk']
  return order
    .map(name => scores.find(s => s.agent === name))
    .filter((s): s is JudgeScore => Boolean(s))
}
