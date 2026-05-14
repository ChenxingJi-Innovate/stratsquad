import { runJSON } from './_run'
import type { Subtask } from '../types'
import type { EventSink } from '../stream'

// The orchestrator reads the strategy question and decomposes it into 4 parallel sub-agent briefs.
// Each sub-agent gets a focused prompt instead of the full question, which sharpens their outputs.
export async function runOrchestrator(question: string, corpus: string, sse: EventSink): Promise<Subtask[]> {
  const prompt = `你是天美策略团队的 AI 编排器。用户输入了一个战略问题，请把它拆解为 4 个并行的子任务，分别交给 4 个专家 Agent 执行。

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
"""
${question}
"""

${corpus.trim() ? `参考语料（用户提供，仅在 trend 简报里酌情引用）：\n"""\n${corpus.slice(0, 3000)}\n"""\n` : ''}

只输出 JSON，schema 严格如下：
{"subtasks":[
  {"agent":"competitor","brief":"..."},
  {"agent":"trend","brief":"..."},
  {"agent":"market","brief":"..."},
  {"agent":"risk","brief":"..."}
]}`

  const parsed = await runJSON<{ subtasks: Subtask[] }>({
    agent: 'orchestrator',
    prompt,
    sse,
    maxTokens: 800,
  })

  const fixed = (parsed.subtasks ?? []).filter(s => ['competitor', 'trend', 'market', 'risk'].includes(s.agent))
  if (fixed.length !== 4) {
    throw new Error('Orchestrator did not return 4 subtasks')
  }
  return fixed
}
