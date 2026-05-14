// ─── Agent roster ────────────────────────────────────────────────────────────
export type SubAgent = 'competitor' | 'trend' | 'market' | 'risk'
export type AgentName = 'orchestrator' | SubAgent | 'judge' | 'composer'

export const AGENT_LABEL_ZH: Record<AgentName, string> = {
  orchestrator: '编排器',
  competitor: '竞品分析',
  trend: '行业趋势',
  market: '区域市场',
  risk: '政策风险',
  judge: '评委',
  composer: '终稿合成',
}

export const AGENT_LABEL_EN: Record<AgentName, string> = {
  orchestrator: 'Orchestrator',
  competitor: 'Competitor',
  trend: 'Trend',
  market: 'Market',
  risk: 'Risk',
  judge: 'Judge',
  composer: 'Composer',
}

// ─── Orchestrator plan ───────────────────────────────────────────────────────
export type Subtask = {
  agent: SubAgent
  brief: string  // the subtask the orchestrator is delegating to this sub-agent
}

// ─── Judge rubric ────────────────────────────────────────────────────────────
// Scores are 0-100; threshold for "pass" is 70. Below threshold triggers one retry.
export type JudgeScore = {
  agent: SubAgent
  evidence: number      // 证据充分性 — does it cite data, examples, products?
  logic: number         // 逻辑严密性 — does the argument chain hold?
  actionability: number // 可执行性 — can a PM act on this tomorrow?
  novelty: number       // 新颖度 — beyond common knowledge?
  total: number         // weighted mean rounded to int
  verdict: 'pass' | 'retry'
  reason: string        // 1-2 sentences for the timeline
}

export const JUDGE_PASS_THRESHOLD = 70

// ─── RAG hit (re-exported from lib/rag/types for convenience) ────────────────
export type RagHit = {
  id: string
  source: string
  heading?: string
  text: string
  score: number
}

// ─── Streaming event protocol ────────────────────────────────────────────────
// Server emits these as SSE `data:` lines; UI deserializes into a timeline.
export type StreamEvent =
  | { type: 'agent_start'; agent: AgentName }
  | { type: 'agent_token'; agent: AgentName; delta: string }
  | { type: 'agent_done'; agent: AgentName; content: string }
  | { type: 'plan'; subtasks: Subtask[] }
  | { type: 'rag_hits'; query: string; hits: RagHit[] }
  | { type: 'subagents_done'; outputs: Record<SubAgent, string> }
  | { type: 'judge'; scores: JudgeScore[] }
  | { type: 'retry'; agent: SubAgent; reason: string }
  | { type: 'brief'; markdown: string }
  | { type: 'complete' }
  | { type: 'error'; message: string }

// ─── Final result the UI assembles ───────────────────────────────────────────
export type FullResult = {
  question: string
  plan: Subtask[]
  ragHits: RagHit[]
  outputs: Record<SubAgent, string>
  scores: JudgeScore[]
  brief: string
  retries: SubAgent[]
}
