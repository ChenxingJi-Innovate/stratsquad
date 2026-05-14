'use client'
import { useState, useRef } from 'react'
import { marked } from 'marked'
import {
  ArrowRight, Sparkles, Loader2, Check, AlertCircle, Brain, Target, TrendingUp,
  Globe, ShieldAlert, Scale, FileText, RotateCw, Download, Copy, ChevronDown,
  Database, Search,
} from 'lucide-react'
import type { AgentName, StreamEvent, Subtask, JudgeScore, SubAgent, FullResult, RagHit } from '../lib/types'
import { AGENT_LABEL_ZH, JUDGE_PASS_THRESHOLD } from '../lib/types'

type AgentStatus = 'idle' | 'queued' | 'running' | 'done' | 'retry'
type AgentState = { status: AgentStatus; content: string }

const AGENT_ORDER: AgentName[] = ['orchestrator', 'competitor', 'trend', 'market', 'risk', 'judge', 'composer']

const AGENT_ICON: Record<AgentName, React.ReactNode> = {
  orchestrator: <Brain className="w-4 h-4" strokeWidth={1.6} />,
  competitor: <Target className="w-4 h-4" strokeWidth={1.6} />,
  trend: <TrendingUp className="w-4 h-4" strokeWidth={1.6} />,
  market: <Globe className="w-4 h-4" strokeWidth={1.6} />,
  risk: <ShieldAlert className="w-4 h-4" strokeWidth={1.6} />,
  judge: <Scale className="w-4 h-4" strokeWidth={1.6} />,
  composer: <FileText className="w-4 h-4" strokeWidth={1.6} />,
}

const SAMPLE_QUESTION = '评估 2026 下半年发布一款 MOBA 手游进入东南亚市场（重点印尼 / 越南 / 菲律宾）的窗口期、竞品壁垒、商业化路径与主要政策风险，并给出 90 天落地动作清单。'

const SAMPLE_CORPUS = `据 Niko Partners 2025 年度东南亚游戏市场报告，东南亚移动游戏市场规模预计 2026 年达到 76 亿美元，年增长 8.3%。印尼贡献约 35% 份额，越南 22%，菲律宾 14%。

MOBA 品类在东南亚仍是大盘第一，Mobile Legends: Bang Bang 月活约 1.1 亿，Arena of Valor 月活 5500 万。两者合计市占超过 80%。

Sensor Tower 数据显示，2025 Q3 东南亚 MOBA 品类 ARPU 约 4.2 美元，付费率 6.8%，皮肤为主要付费点（占流水 65%）。

电竞生态：MPL Indonesia / Vietnam / Philippines 是 Moonton 旗下赛事，年度奖金 50 万美元级，构成强护城河。

技术趋势：UE5 mobile pipeline、AI 智能匹配、跨端云游戏在 2025 年开始在 MOBA 品类小规模试水。`

export default function Home() {
  const [question, setQuestion] = useState('')
  const [corpus, setCorpus] = useState('')
  const [showCorpus, setShowCorpus] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<Record<AgentName, AgentState>>(initAgents())
  const [plan, setPlan] = useState<Subtask[]>([])
  const [ragHits, setRagHits] = useState<RagHit[]>([])
  const [ragQuery, setRagQuery] = useState('')
  const [scores, setScores] = useState<JudgeScore[]>([])
  const [retries, setRetries] = useState<SubAgent[]>([])
  const [brief, setBrief] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  function initAgents(): Record<AgentName, AgentState> {
    return Object.fromEntries(AGENT_ORDER.map(a => [a, { status: 'idle', content: '' }])) as Record<AgentName, AgentState>
  }

  function resetRun() {
    setAgents(initAgents())
    setPlan([]); setRagHits([]); setRagQuery(''); setScores([]); setRetries([]); setBrief(''); setError('')
  }

  async function run() {
    if (!question.trim() || running) return
    resetRun()
    setRunning(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, corpus }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(await res.text() || 'request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n\n')
        buf = lines.pop() ?? ''
        for (const block of lines) {
          const trimmed = block.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload) continue
          try {
            const ev: StreamEvent = JSON.parse(payload)
            handleEvent(ev)
          } catch { /* malformed line, skip */ }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message ?? 'run failed')
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  function handleEvent(ev: StreamEvent) {
    switch (ev.type) {
      case 'agent_start':
        setAgents(a => ({ ...a, [ev.agent]: { status: 'running', content: '' } }))
        break
      case 'agent_token':
        setAgents(a => ({ ...a, [ev.agent]: { status: 'running', content: a[ev.agent].content + ev.delta } }))
        break
      case 'agent_done':
        setAgents(a => ({ ...a, [ev.agent]: { status: 'done', content: ev.content } }))
        break
      case 'plan':
        setPlan(ev.subtasks)
        // mark sub-agents as queued so the timeline shows pending pills
        setAgents(a => {
          const next = { ...a }
          ;(['competitor', 'trend', 'market', 'risk'] as SubAgent[]).forEach(s => {
            if (next[s].status === 'idle') next[s] = { ...next[s], status: 'queued' }
          })
          return next
        })
        break
      case 'rag_hits':
        setRagQuery(ev.query)
        setRagHits(ev.hits)
        break
      case 'judge':
        setScores(ev.scores)
        break
      case 'retry':
        setRetries(r => [...r, ev.agent])
        setAgents(a => ({ ...a, [ev.agent]: { status: 'retry', content: '' } }))
        break
      case 'brief':
        setBrief(ev.markdown)
        break
      case 'error':
        setError(ev.message)
        break
    }
  }

  function downloadResult() {
    const result: FullResult = {
      question,
      plan,
      ragHits,
      outputs: {
        competitor: agents.competitor.content,
        trend: agents.trend.content,
        market: agents.market.content,
        risk: agents.risk.content,
      },
      scores,
      brief,
      retries,
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stratsquad-brief-${Date.now()}.json`
    a.click()
  }

  function copyBrief() {
    navigator.clipboard.writeText(brief)
  }

  return (
    <main className="min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-pushpin-50/50 via-transparent to-transparent" aria-hidden />
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-pill bg-pushpin-100/40 blur-3xl" aria-hidden />
        <div className="absolute top-60 -left-32 w-[420px] h-[420px] rounded-pill bg-pushpin-50/60 blur-3xl" aria-hidden />

        <div className="relative max-w-6xl mx-auto px-600 sm:px-800 pt-1300 pb-1200 sm:pt-1600">
          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-1200 items-center">
            <div className="animate-fadeUp">
              <div className="inline-flex items-center gap-200 px-300 py-100 rounded-pill bg-mochimalist/80 backdrop-blur-md shadow-glass text-100 font-bold text-pushpin-450 mb-700">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="tracking-[0.18em]">MULTI-AGENT STRATEGY COPILOT</span>
              </div>

              <h1 className="font-bold tracking-[-0.04em] text-cosmicore leading-[0.95] mb-500" style={{ fontSize: 'clamp(48px, 8vw, 84px)' }}>
                StratSquad<br />
                <span className="font-display italic font-normal text-pushpin-450 tracking-[-0.02em]">a squad of agents.</span>
              </h1>

              <p className="text-400 text-roboflow-700 leading-relaxed max-w-lg mb-300">
                输入一个游戏战略问题，编排器拆解任务，四位专家 Agent 并行作战，评委打分，终稿合成。
              </p>
              <p className="font-display italic text-200 text-roboflow-500 max-w-lg tracking-tight">
                Orchestrator + 4 sub-agents + judge + composer · powered by DeepSeek V4.
              </p>

              <div className="flex flex-wrap items-center gap-400 mt-800">
                <a href="#input" className="inline-flex items-center gap-200 px-500 py-300 rounded-pill bg-cosmicore text-mochimalist text-200 font-semibold transition-all duration-500 ease-apple hover:bg-roboflow-700 hover:shadow-lift hover:-translate-y-0.5">
                  开始一次推演 <ArrowRight className="w-4 h-4" />
                </a>
                <span className="text-100 font-mono text-roboflow-500 hidden sm:block">7 agents · SSE streaming · 评委驱动 retry</span>
              </div>
            </div>

            <div className="relative h-[440px] hidden lg:block">
              <PreviewCard className="absolute top-0 left-0 w-72 animate-floatA" badge="01 编排" badgeColor="bg-roboflow-100/90 backdrop-blur-sm text-roboflow-700" icon={<Brain className="w-3.5 h-3.5" />}>
                <p className="text-200 text-cosmicore leading-relaxed">把战略问题拆成 4 个子任务，分发给 4 位专家 agent。</p>
                <p className="text-100 font-mono text-roboflow-400 mt-200 tracking-wider">orchestrator.json</p>
              </PreviewCard>
              <PreviewCard className="absolute top-32 right-0 w-72 animate-floatB" badge="02 并行" badgeColor="bg-pushpin-50/90 backdrop-blur-sm text-pushpin-450" icon={<Target className="w-3.5 h-3.5" />}>
                <div className="space-y-200">
                  <MiniRow label="竞品" tone="run" />
                  <MiniRow label="趋势" tone="run" />
                  <MiniRow label="区域" tone="run" />
                  <MiniRow label="风险" tone="done" />
                </div>
              </PreviewCard>
              <PreviewCard className="absolute bottom-0 left-12 w-80 animate-floatC" badge="03 评委 / 终稿" badgeColor="bg-pushpin-450 text-mochimalist" icon={<Scale className="w-3.5 h-3.5" />}>
                <div className="flex items-center gap-300 text-100 font-mono">
                  <span className="text-pushpin-450 font-bold">证据 82</span>
                  <span className="text-pushpin-450 font-bold">逻辑 78</span>
                </div>
                <p className="text-100 font-mono text-roboflow-500 mt-200">composer → 战略简报.md</p>
              </PreviewCard>
            </div>
          </div>
        </div>
      </section>

      {/* INPUT */}
      <div className="max-w-4xl mx-auto px-600 sm:px-800 pb-1500">
        <section id="input" className="mb-1000 animate-fadeUp">
          <SectionHeader number="01" title="战略问题输入" subtitle="把你想问策略团队的问题原样写进来。可选附带行业语料 / 数据片段，Agent 会优先引用。" />

          <div className="rounded-400 bg-mochimalist shadow-floating overflow-hidden">
            <textarea
              className="w-full h-48 p-600 text-300 bg-transparent resize-y outline-none placeholder:text-roboflow-400 leading-relaxed"
              placeholder="例：评估 2026 下半年发布一款 MOBA 手游进入东南亚市场的窗口期…"
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />

            <button
              onClick={() => setShowCorpus(v => !v)}
              className="w-full px-600 py-300 flex items-center justify-between text-100 font-bold uppercase tracking-[0.18em] text-roboflow-500 border-t border-roboflow-100 hover:bg-roboflow-50 transition-colors duration-300 ease-apple"
            >
              <span className="flex items-center gap-200">
                <FileText className="w-3.5 h-3.5" />
                可选语料 · 行业报告 / 数据片段
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ease-apple ${showCorpus ? 'rotate-180' : ''}`} />
            </button>
            {showCorpus && (
              <textarea
                className="w-full h-40 px-600 pb-400 text-200 bg-transparent resize-y outline-none placeholder:text-roboflow-400 leading-relaxed border-t border-roboflow-100"
                placeholder="粘贴一段 Niko Partners / 伽马数据 / Sensor Tower / GameLook 报告片段。趋势 Agent 会优先引用。"
                value={corpus}
                onChange={e => setCorpus(e.target.value)}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-300 px-600 py-300 border-t border-roboflow-100">
              <div className="flex items-center gap-300">
                <span className="text-100 font-mono text-roboflow-500">{question.length} 字</span>
                {!question && (
                  <button
                    onClick={() => { setQuestion(SAMPLE_QUESTION); setCorpus(SAMPLE_CORPUS); setShowCorpus(true) }}
                    className="inline-flex items-center gap-100 px-300 py-100 rounded-pill bg-pushpin-50 text-pushpin-450 text-100 font-bold transition-all duration-300 ease-apple hover:bg-pushpin-100 hover:scale-105 active:scale-95"
                  >
                    <Sparkles className="w-3 h-3" />
                    一键填入示例问题
                  </button>
                )}
              </div>
              <button
                onClick={run}
                disabled={running || !question.trim()}
                className="inline-flex items-center gap-200 px-500 py-200 rounded-pill bg-cosmicore text-mochimalist text-200 font-semibold transition-all duration-500 ease-apple hover:bg-roboflow-700 hover:shadow-raised hover:-translate-y-0.5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {running ? <><Loader2 className="w-4 h-4 animate-spin" />Agent 推演中</> : <>启动 Squad<ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        </section>

        {/* TIMELINE — visible whenever the run has produced anything */}
        {(running || hasAnyContent(agents)) && (
          <section className="mb-1000 animate-fadeUp">
            <SectionHeader number="02" title="Agent 推演时间线" subtitle="编排器先出 plan，4 位专家并行作战；评委低于 70 分会触发 retry。所有 token 通过 SSE 实时回传。" />

            <div className="space-y-300">
              {AGENT_ORDER.map(name => (
                <AgentRow
                  key={name}
                  name={name}
                  state={agents[name]}
                  brief={plan.find(p => p.agent === name as SubAgent)?.brief}
                  score={scores.find(s => s.agent === name as SubAgent)}
                  wasRetried={retries.includes(name as SubAgent)}
                />
              ))}
            </div>
          </section>
        )}

        {/* RAG HITS */}
        {ragHits.length > 0 && (
          <section className="mb-1000 animate-fadeUp">
            <SectionHeader number="03" title="RAG 检索命中" subtitle={`查询：${ragQuery.slice(0, 80)}${ragQuery.length > 80 ? '…' : ''} · 模型 BGE-M3 (1024d) · top-${ragHits.length} 按 cosine 相似度排序`} />
            <div className="space-y-300">
              {ragHits.map((h, i) => <RagHitCard key={h.id} hit={h} rank={i + 1} />)}
            </div>
          </section>
        )}

        {/* JUDGE GRID */}
        {scores.length > 0 && (
          <section className="mb-1000 animate-fadeUp">
            <SectionHeader number="04" title="评委评分矩阵" subtitle={`证据 0.35 · 逻辑 0.25 · 可执行 0.30 · 新颖 0.10 · 通过线 ${JUDGE_PASS_THRESHOLD} 分`} />
            <div className="rounded-400 bg-mochimalist shadow-floating overflow-hidden">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_0.8fr] gap-200 px-500 py-300 text-100 font-bold uppercase tracking-[0.18em] text-roboflow-500 border-b border-roboflow-100">
                <span>Agent</span>
                <span className="text-center">证据</span>
                <span className="text-center">逻辑</span>
                <span className="text-center">可执行</span>
                <span className="text-center">新颖</span>
                <span className="text-right">总分</span>
              </div>
              {scores.map(s => <ScoreRow key={s.agent} score={s} />)}
            </div>
          </section>
        )}

        {/* BRIEF */}
        {brief && (
          <section className="mb-1000 animate-fadeUp">
            <SectionHeader number="05" title="战略简报终稿" subtitle="Composer 把 4 份 sub-agent 输出整合为给高层看的 markdown 简报。" />
            <div className="rounded-400 bg-mochimalist shadow-floating p-700 sm:p-900">
              <div
                className="prose-brief font-sans text-300 leading-[1.85] text-cosmicore"
                dangerouslySetInnerHTML={{ __html: marked.parse(brief, { breaks: true }) as string }}
              />
            </div>
            <div className="mt-500 flex items-center justify-between rounded-400 bg-cosmicore p-500 shadow-lift overflow-hidden relative gap-400">
              <div className="absolute inset-0 bg-gradient-to-br from-pushpin-450/20 to-transparent" aria-hidden />
              <div className="relative">
                <div className="text-200 font-bold text-mochimalist">导出</div>
                <div className="text-100 text-roboflow-300 mt-100">完整 JSON (问题 + plan + 4 份原始输出 + 评分 + 终稿) 可以丢给训练管线</div>
              </div>
              <div className="relative flex items-center gap-200 shrink-0">
                <button onClick={copyBrief} className="inline-flex items-center gap-200 px-400 py-200 rounded-pill bg-mochimalist/10 text-mochimalist text-100 font-bold transition-all duration-300 ease-apple hover:bg-mochimalist/20">
                  <Copy className="w-3.5 h-3.5" /> 复制 Markdown
                </button>
                <button onClick={downloadResult} className="inline-flex items-center gap-200 px-500 py-300 rounded-pill bg-pushpin-450 text-mochimalist text-200 font-semibold transition-all duration-500 ease-apple hover:bg-pushpin-500 hover:shadow-lift hover:-translate-y-0.5">
                  <Download className="w-4 h-4" /> 下载完整 JSON
                </button>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="mt-800 rounded-400 bg-pushpin-50 p-400 text-200 text-pushpin-700 flex items-start gap-300 animate-fadeUp">
            <AlertCircle className="w-4 h-4 mt-100 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}
      </div>

      <footer className="border-t border-roboflow-100 py-700 px-600">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-300">
          <div className="text-100 text-roboflow-500">
            <span className="font-bold text-cosmicore">StratSquad</span> · <span className="font-display italic">a squad of agents for game strategy work</span>
          </div>
          <div className="text-100 font-mono text-roboflow-400 tracking-tight">
            DeepSeek V4 · Pinterest Gestalt · Apple HIG
          </div>
        </div>
      </footer>
    </main>
  )
}

function hasAnyContent(agents: Record<AgentName, AgentState>): boolean {
  return AGENT_ORDER.some(n => agents[n].status !== 'idle')
}

/* ─────── components ─────── */

function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <div className="mb-600 flex items-start gap-400">
      <span className="font-mono text-500 font-bold text-pushpin-450 leading-none shrink-0 w-1100 tabular-nums">{number}</span>
      <div className="pt-100">
        <h2 className="text-500 font-bold text-cosmicore tracking-[-0.02em] mb-100">{title}</h2>
        <p className="text-200 text-roboflow-600 leading-relaxed max-w-xl">{subtitle}</p>
      </div>
    </div>
  )
}

function PreviewCard({ className, badge, badgeColor, icon, children }: { className?: string; badge: string; badgeColor: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`rounded-400 bg-mochimalist/80 backdrop-blur-xl shadow-lift p-500 transition-transform duration-700 ease-apple hover:scale-105 ${className ?? ''}`}>
      <div className={`inline-flex items-center gap-100 px-200 py-100 rounded-pill text-100 font-bold mb-300 ${badgeColor}`}>
        {icon}
        <span className="tracking-wide">{badge}</span>
      </div>
      {children}
    </div>
  )
}

function MiniRow({ label, tone }: { label: string; tone: 'run' | 'done' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-200 text-cosmicore font-semibold">{label}</span>
      {tone === 'run' ? (
        <span className="inline-flex items-center gap-100 px-200 py-100 rounded-pill bg-pushpin-50 text-pushpin-450 text-100 font-mono font-bold">
          <Loader2 className="w-3 h-3 animate-spin" />running
        </span>
      ) : (
        <span className="inline-flex items-center gap-100 px-200 py-100 rounded-pill bg-roboflow-100 text-roboflow-700 text-100 font-mono font-bold">
          <Check className="w-3 h-3" />done
        </span>
      )}
    </div>
  )
}

function AgentRow({ name, state, brief, score, wasRetried }: { name: AgentName; state: AgentState; brief?: string; score?: JudgeScore; wasRetried: boolean }) {
  const [open, setOpen] = useState(false)
  const isStreaming = state.status === 'running'
  const isDone = state.status === 'done'
  const isQueued = state.status === 'queued'
  const isRetry = state.status === 'retry'

  const statusColor =
    isDone ? 'bg-pushpin-450 text-mochimalist' :
    isStreaming ? 'bg-cosmicore text-mochimalist animate-pulseRing' :
    isRetry ? 'bg-pushpin-50 text-pushpin-700' :
    isQueued ? 'bg-roboflow-100 text-roboflow-600' :
    'bg-roboflow-50 text-roboflow-400'

  const statusText =
    isDone ? 'DONE' :
    isStreaming ? 'RUNNING' :
    isRetry ? 'RETRY' :
    isQueued ? 'QUEUED' :
    'IDLE'

  return (
    <article className={`rounded-400 bg-mochimalist transition-all duration-500 ease-apple ${
      isStreaming ? 'shadow-raised ring-2 ring-pushpin-450/30' : isDone ? 'shadow-floating' : 'shadow-floating opacity-90'
    }`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-500 flex items-start gap-400">
        <span className={`shrink-0 w-1000 h-1000 rounded-pill flex items-center justify-center ${
          isDone ? 'bg-pushpin-450 text-mochimalist' :
          isStreaming ? 'bg-cosmicore text-mochimalist' :
          'bg-roboflow-100 text-roboflow-500'
        }`}>
          {AGENT_ICON[name]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-300 flex-wrap">
            <div className="flex items-center gap-300">
              <span className="text-200 font-bold text-cosmicore">{AGENT_LABEL_ZH[name]}</span>
              <span className="text-100 font-mono text-roboflow-400 uppercase tracking-wider">{name}</span>
              {wasRetried && (
                <span className="inline-flex items-center gap-100 px-200 py-100 rounded-pill bg-pushpin-50 text-pushpin-450 text-100 font-mono font-bold">
                  <RotateCw className="w-3 h-3" />retried
                </span>
              )}
            </div>
            <div className="flex items-center gap-200">
              {score && (
                <span className={`text-100 font-mono font-bold px-200 py-100 rounded-pill ${
                  score.verdict === 'pass' ? 'bg-pushpin-50 text-pushpin-450' : 'bg-roboflow-100 text-roboflow-600'
                }`}>{score.total}/100</span>
              )}
              <span className={`text-100 font-mono font-bold px-300 py-100 rounded-pill tracking-wider ${statusColor}`}>
                {isStreaming && <Loader2 className="inline w-3 h-3 mr-100 animate-spin" />}
                {statusText}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-roboflow-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {brief && !open && (
            <p className="mt-200 text-100 text-roboflow-500 leading-relaxed line-clamp-2">{brief}</p>
          )}
          {score && !open && (
            <p className="mt-200 text-100 text-roboflow-600 leading-relaxed italic">{score.reason}</p>
          )}
        </div>
      </button>

      {open && (
        <div className="px-500 pb-500 -mt-200 space-y-300">
          {brief && (
            <div className="rounded-300 bg-roboflow-50 p-400">
              <div className="text-100 font-bold uppercase tracking-[0.18em] text-roboflow-500 mb-200">分派的任务简报</div>
              <p className="text-200 text-cosmicore leading-relaxed">{brief}</p>
            </div>
          )}
          {state.content && (
            <div className="rounded-300 bg-roboflow-50 p-400 max-h-[420px] overflow-y-auto">
              <div className="text-100 font-bold uppercase tracking-[0.18em] text-roboflow-500 mb-200">Agent 输出{isStreaming && <span className="ml-200 text-pushpin-450">· streaming</span>}</div>
              <div
                className="prose-brief font-sans text-200 leading-[1.75] text-roboflow-700"
                dangerouslySetInnerHTML={{ __html: marked.parse(state.content, { breaks: true }) as string }}
              />
            </div>
          )}
          {score && (
            <div className="rounded-300 bg-pushpin-50/40 p-400">
              <div className="text-100 font-bold uppercase tracking-[0.18em] text-pushpin-450 mb-200">评委评语</div>
              <p className="text-200 text-cosmicore leading-relaxed">{score.reason}</p>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function RagHitCard({ hit, rank }: { hit: RagHit; rank: number }) {
  const pct = Math.round(hit.score * 100)
  return (
    <article className="rounded-400 bg-mochimalist shadow-floating p-500 transition-all duration-500 ease-apple hover:shadow-lift">
      <div className="flex items-start gap-400">
        <span className="shrink-0 inline-flex items-center justify-center w-1100 h-1100 rounded-pill bg-pushpin-50 text-pushpin-450 font-mono text-200 font-bold tabular-nums">
          #{rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-200 mb-200">
            <span className="inline-flex items-center gap-100 px-200 py-100 rounded-pill bg-roboflow-100 text-roboflow-700 text-100 font-mono font-bold">
              <Database className="w-3 h-3" />
              {hit.source}
            </span>
            {hit.heading && (
              <span className="text-100 font-mono text-roboflow-500">§ {hit.heading}</span>
            )}
            <span className="ml-auto inline-flex items-center gap-100 px-200 py-100 rounded-pill bg-pushpin-450 text-mochimalist text-100 font-mono font-bold tabular-nums">
              <Search className="w-3 h-3" />
              sim {hit.score.toFixed(3)}
            </span>
          </div>
          <div className="w-full h-100 rounded-pill bg-roboflow-100 overflow-hidden mb-300">
            <div className="h-full rounded-pill bg-pushpin-450" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-200 text-roboflow-700 leading-relaxed whitespace-pre-wrap">{hit.text}</p>
        </div>
      </div>
    </article>
  )
}

function ScoreRow({ score }: { score: JudgeScore }) {
  const dims = [
    { key: 'evidence' as const, value: score.evidence },
    { key: 'logic' as const, value: score.logic },
    { key: 'actionability' as const, value: score.actionability },
    { key: 'novelty' as const, value: score.novelty },
  ]
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_0.8fr] gap-200 px-500 py-400 items-center border-b border-roboflow-100 last:border-0">
      <div className="flex items-center gap-200">
        {AGENT_ICON[score.agent]}
        <span className="text-200 font-semibold text-cosmicore">{AGENT_LABEL_ZH[score.agent]}</span>
      </div>
      {dims.map(d => (
        <div key={d.key} className="flex flex-col items-center">
          <span className="text-200 font-mono font-bold text-cosmicore tabular-nums">{d.value}</span>
          <div className="mt-100 w-full h-100 rounded-pill bg-roboflow-100 overflow-hidden">
            <div className={`h-full rounded-pill ${d.value >= 70 ? 'bg-pushpin-450' : 'bg-roboflow-400'}`} style={{ width: `${d.value}%` }} />
          </div>
        </div>
      ))}
      <span className={`text-right text-300 font-mono font-bold tabular-nums ${score.verdict === 'pass' ? 'text-pushpin-450' : 'text-roboflow-500'}`}>
        {score.total}
      </span>
    </div>
  )
}
