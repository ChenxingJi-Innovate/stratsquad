'use client'
import { useState, useRef, useEffect } from 'react'
import { marked } from 'marked'
import {
  Loader2, AlertCircle, Brain, Target, TrendingUp,
  Globe, ShieldAlert, Scale, FileText, RotateCw, Download, Copy, ChevronDown,
  Database, Terminal, Play, Square, Activity,
} from 'lucide-react'
import type { AgentName, StreamEvent, Subtask, JudgeScore, SubAgent, FullResult, RagHit } from '../lib/types'
import { AGENT_LABEL_ZH, JUDGE_PASS_THRESHOLD } from '../lib/types'

type AgentStatus = 'idle' | 'queued' | 'running' | 'done' | 'retry'
type AgentState = { status: AgentStatus; content: string; startedAt?: number; finishedAt?: number; tokens: number }

const AGENT_ORDER: AgentName[] = ['orchestrator', 'competitor', 'trend', 'market', 'risk', 'judge', 'composer']

const AGENT_ICON: Record<AgentName, React.ReactNode> = {
  orchestrator: <Brain className="w-3.5 h-3.5" strokeWidth={1.5} />,
  competitor: <Target className="w-3.5 h-3.5" strokeWidth={1.5} />,
  trend: <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} />,
  market: <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />,
  risk: <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.5} />,
  judge: <Scale className="w-3.5 h-3.5" strokeWidth={1.5} />,
  composer: <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />,
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
  const [runStart, setRunStart] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const abortRef = useRef<AbortController | null>(null)

  function initAgents(): Record<AgentName, AgentState> {
    return Object.fromEntries(AGENT_ORDER.map(a => [a, { status: 'idle', content: '', tokens: 0 }])) as Record<AgentName, AgentState>
  }

  function resetRun() {
    setAgents(initAgents())
    setPlan([]); setRagHits([]); setRagQuery(''); setScores([]); setRetries([]); setBrief(''); setError('')
  }

  // tick at 100ms while running for a live elapsed counter
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [running])

  async function run() {
    if (!question.trim() || running) return
    resetRun()
    setRunning(true)
    setRunStart(Date.now())

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
          } catch { /* malformed line */ }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message ?? 'run failed')
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  function abort() {
    abortRef.current?.abort()
    setRunning(false)
  }

  function handleEvent(ev: StreamEvent) {
    switch (ev.type) {
      case 'agent_start':
        setAgents(a => ({ ...a, [ev.agent]: { ...a[ev.agent], status: 'running', content: '', startedAt: Date.now(), tokens: 0 } }))
        break
      case 'agent_token':
        setAgents(a => ({
          ...a,
          [ev.agent]: {
            ...a[ev.agent],
            status: 'running',
            content: a[ev.agent].content + ev.delta,
            tokens: a[ev.agent].tokens + 1,
          },
        }))
        break
      case 'agent_done':
        setAgents(a => ({ ...a, [ev.agent]: { ...a[ev.agent], status: 'done', content: ev.content, finishedAt: Date.now() } }))
        break
      case 'plan':
        setPlan(ev.subtasks)
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
        setAgents(a => ({ ...a, [ev.agent]: { ...a[ev.agent], status: 'retry', content: '', startedAt: Date.now(), tokens: 0 } }))
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
      question, plan, ragHits,
      outputs: {
        competitor: agents.competitor.content, trend: agents.trend.content,
        market: agents.market.content, risk: agents.risk.content,
      },
      scores, brief, retries,
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stratsquad-${Date.now()}.json`
    a.click()
  }

  function copyBrief() { navigator.clipboard.writeText(brief) }

  const elapsed = runStart ? (now - runStart) / 1000 : 0
  const totalTokens = AGENT_ORDER.reduce((s, n) => s + agents[n].tokens, 0)
  const ragSimAvg = ragHits.length > 0 ? ragHits.reduce((s, h) => s + h.score, 0) / ragHits.length : 0

  return (
    <main className="min-h-screen bg-canvas text-ink-primary">
      {/* TOP CHROME */}
      <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-sm border-b border-hairline">
        <div className="max-w-7xl mx-auto px-500 sm:px-700 h-1300 flex items-center justify-between gap-400">
          <div className="flex items-center gap-400 min-w-0">
            <Terminal className="w-4 h-4 text-signal-blue shrink-0" strokeWidth={2} />
            <span className="text-200 font-mono font-semibold text-ink-primary">STRATSQUAD</span>
            <span className="hidden sm:inline text-100 font-mono text-ink-tertiary truncate">
              <span className="text-ink-secondary">multi-agent inference console</span> · v0.2
            </span>
          </div>
          <div className="hidden md:flex items-center gap-400 text-100 font-mono text-ink-tertiary">
            <MetaBadge label="model" value="deepseek-v4-flash" />
            <MetaBadge label="embed" value="bge-m3" />
            <MetaBadge label="eval" value="hit@5 90.9%" tone="green" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-500 sm:px-700 py-700">
        {/* INTRO */}
        <section className="mb-900 pt-600">
          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-800 items-end">
            <div>
              <div className="flex items-center gap-300 mb-400 text-100 font-mono text-ink-tertiary">
                <span className="w-200 h-200 rounded-full bg-signal-green animate-pulseDot" />
                <span className="uppercase tracking-[0.2em]">stratsquad / runtime ready</span>
              </div>
              <h1 className="text-600 sm:text-[44px] font-semibold tracking-[-0.02em] text-ink-primary leading-[1.1] mb-400">
                A squad of agents, debating one strategy question.
              </h1>
              <p className="text-300 text-ink-secondary leading-relaxed max-w-xl">
                Orchestrator decomposes the question, four expert agents argue in parallel, a judge scores them, then the composer ships a brief. Every token, every retrieval, every score is on the wire.
              </p>
            </div>
            <div className="rounded-4 border border-hairline bg-surface p-500 font-mono text-100 text-ink-secondary space-y-200">
              <div className="text-ink-tertiary uppercase tracking-[0.18em] text-[10px]">pipeline</div>
              <div><span className="text-signal-blue">●</span> orchestrator → 4 sub-briefs</div>
              <div><span className="text-signal-blue">●</span> rag.retrieve → top-5 chunks</div>
              <div><span className="text-signal-blue">●</span> competitor · trend · market · risk (parallel)</div>
              <div><span className="text-signal-amber">●</span> judge → rubric 4-dim, retry &lt; {JUDGE_PASS_THRESHOLD}</div>
              <div><span className="text-signal-green">●</span> composer → final brief</div>
            </div>
          </div>
        </section>

        {/* INPUT */}
        <section id="input" className="mb-800">
          <SectionRow label="01" title="STRATEGY QUESTION" desc="原样写问题。可选附行业语料 / 数据片段。" />

          <div className="rounded-4 border border-hairline bg-surface overflow-hidden">
            <textarea
              className="w-full h-44 px-500 py-400 text-200 bg-transparent resize-y outline-none placeholder:text-ink-tertiary leading-relaxed font-sans"
              placeholder="例：评估 2026 下半年发布一款 MOBA 手游进入东南亚市场的窗口期..."
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />

            <button
              onClick={() => setShowCorpus(v => !v)}
              className="w-full px-500 py-300 flex items-center justify-between text-100 font-mono uppercase tracking-[0.15em] text-ink-secondary border-t border-hairline hover:bg-surface-2 transition-colors duration-150 ease-console"
            >
              <span className="flex items-center gap-200">
                <FileText className="w-3 h-3" />
                CORPUS · 行业报告 / 数据片段（可选）
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-150 ease-console ${showCorpus ? 'rotate-180' : ''}`} />
            </button>
            {showCorpus && (
              <textarea
                className="w-full h-32 px-500 pb-400 text-100 font-mono bg-transparent resize-y outline-none placeholder:text-ink-tertiary leading-relaxed border-t border-hairline"
                placeholder="粘贴 Niko Partners / 伽马数据 / Sensor Tower 报告片段。"
                value={corpus}
                onChange={e => setCorpus(e.target.value)}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-300 px-500 py-300 border-t border-hairline bg-surface-2/50">
              <div className="flex items-center gap-400 text-100 font-mono text-ink-tertiary">
                <span><span className="text-ink-secondary tabular-nums">{question.length}</span> chars</span>
                {!question && (
                  <button
                    onClick={() => { setQuestion(SAMPLE_QUESTION); setCorpus(SAMPLE_CORPUS); setShowCorpus(true) }}
                    className="inline-flex items-center gap-100 text-signal-blue hover:text-signal-blue-bright transition-colors duration-150 ease-console"
                  >
                    [load sample]
                  </button>
                )}
              </div>
              {running ? (
                <button
                  onClick={abort}
                  className="inline-flex items-center gap-200 px-400 h-900 rounded-4 bg-surface-2 border border-signal-red/40 text-signal-red text-100 font-mono font-semibold uppercase tracking-wider hover:bg-signal-red-soft transition-colors duration-150 ease-console"
                >
                  <Square className="w-3 h-3" fill="currentColor" /> abort
                </button>
              ) : (
                <button
                  onClick={run}
                  disabled={!question.trim()}
                  className="inline-flex items-center gap-200 px-500 h-900 rounded-4 bg-signal-blue text-white text-100 font-mono font-semibold uppercase tracking-wider hover:bg-signal-blue-bright transition-colors duration-150 ease-console disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Play className="w-3 h-3" fill="currentColor" /> run squad
                </button>
              )}
            </div>
          </div>
        </section>

        {/* TIMELINE */}
        {(running || hasAnyContent(agents) || brief) && (
          <section className="mb-800 animate-fadeIn">
            <SectionRow
              label="02"
              title="AGENT TIMELINE"
              desc="编排器先出 plan，4 位专家并行作战；评委低于 70 分触发 retry。全程 SSE。"
              right={
                <div className="flex items-center gap-400 text-100 font-mono text-ink-tertiary">
                  <span><Activity className="inline w-3 h-3 mr-100" /><span className="text-ink-primary tabular-nums">{elapsed.toFixed(1)}</span>s</span>
                  <span><span className="text-ink-primary tabular-nums">{totalTokens}</span> tok</span>
                </div>
              }
            />

            <div className="rounded-4 border border-hairline bg-surface overflow-hidden">
              {AGENT_ORDER.map((name, i) => (
                <AgentRow
                  key={name}
                  name={name}
                  state={agents[name]}
                  index={i}
                  brief={plan.find(p => p.agent === name as SubAgent)?.brief}
                  score={scores.find(s => s.agent === name as SubAgent)}
                  wasRetried={retries.includes(name as SubAgent)}
                  isLast={i === AGENT_ORDER.length - 1}
                />
              ))}
            </div>
          </section>
        )}

        {/* RAG HITS */}
        {ragHits.length > 0 && (
          <section className="mb-800 animate-fadeIn">
            <SectionRow
              label="03"
              title="RAG HITS"
              desc={`bge-m3 1024d · top-${ragHits.length} cosine · avg ${ragSimAvg.toFixed(3)}`}
              right={
                <span className="text-100 font-mono text-ink-tertiary truncate max-w-md hidden md:inline">
                  q: <span className="text-ink-secondary">{ragQuery.slice(0, 60)}{ragQuery.length > 60 ? '…' : ''}</span>
                </span>
              }
            />

            <div className="rounded-4 border border-hairline bg-surface overflow-hidden">
              {ragHits.map((h, i) => <RagHitRow key={h.id} hit={h} rank={i + 1} isLast={i === ragHits.length - 1} />)}
            </div>
          </section>
        )}

        {/* JUDGE GRID */}
        {scores.length > 0 && (
          <section className="mb-800 animate-fadeIn">
            <SectionRow
              label="04"
              title="JUDGE RUBRIC"
              desc={`weighted: evidence 0.35 · logic 0.25 · actionability 0.30 · novelty 0.10 · pass ≥ ${JUDGE_PASS_THRESHOLD}`}
            />
            <div className="rounded-4 border border-hairline bg-surface overflow-x-auto">
              <table className="w-full font-mono text-100">
                <thead>
                  <tr className="border-b border-hairline text-ink-tertiary uppercase tracking-[0.15em] text-[11px]">
                    <th className="text-left px-500 py-300 font-medium">agent</th>
                    <th className="text-right px-300 py-300 font-medium">evidence</th>
                    <th className="text-right px-300 py-300 font-medium">logic</th>
                    <th className="text-right px-300 py-300 font-medium">action</th>
                    <th className="text-right px-300 py-300 font-medium">novelty</th>
                    <th className="text-right px-500 py-300 font-medium">total</th>
                    <th className="text-right px-500 py-300 font-medium">verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map(s => <ScoreRow key={s.agent} score={s} />)}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* BRIEF */}
        {brief && (
          <section className="mb-800 animate-fadeIn">
            <SectionRow label="05" title="COMPOSED BRIEF" desc="composer 整合 4 份 sub-agent 输出，给高层看的 markdown." />
            <div className="rounded-4 border border-hairline bg-surface p-700 sm:p-900">
              <div
                className="prose-console font-sans text-200 leading-[1.85]"
                dangerouslySetInnerHTML={{ __html: marked.parse(brief, { breaks: true }) as string }}
              />
            </div>
            <div className="mt-500 rounded-4 border border-hairline bg-surface px-500 py-400 flex flex-wrap items-center justify-between gap-300">
              <div className="text-100 font-mono text-ink-tertiary">
                EXPORT · full JSON (question + plan + 4 outputs + scores + brief) ready for SFT pipeline
              </div>
              <div className="flex items-center gap-200">
                <button onClick={copyBrief} className="inline-flex items-center gap-200 px-300 h-800 rounded-2 border border-hairline text-100 font-mono uppercase tracking-wider text-ink-secondary hover:bg-surface-2 hover:text-ink-primary transition-colors duration-150 ease-console">
                  <Copy className="w-3 h-3" /> copy md
                </button>
                <button onClick={downloadResult} className="inline-flex items-center gap-200 px-400 h-800 rounded-2 bg-signal-blue text-white text-100 font-mono font-semibold uppercase tracking-wider hover:bg-signal-blue-bright transition-colors duration-150 ease-console">
                  <Download className="w-3 h-3" /> download json
                </button>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-4 border border-signal-red/40 bg-signal-red-soft px-400 py-300 flex items-start gap-300 animate-fadeIn">
            <AlertCircle className="w-4 h-4 mt-100 shrink-0 text-signal-red" strokeWidth={2} />
            <span className="text-200 font-mono leading-relaxed text-ink-primary">{error}</span>
          </div>
        )}
      </div>

      <footer className="border-t border-hairline px-500 sm:px-700 py-500 mt-1200">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-300 text-100 font-mono text-ink-tertiary">
          <div>
            <span className="text-ink-secondary font-semibold">stratsquad</span>
            <span className="mx-300 text-ink-tertiary">|</span>
            multi-agent strategy copilot · deepseek v4 · bge-m3
          </div>
          <div>track 2 · industrial console · vercel geist + ibm carbon</div>
        </div>
      </footer>
    </main>
  )
}

function hasAnyContent(agents: Record<AgentName, AgentState>): boolean {
  return AGENT_ORDER.some(n => agents[n].status !== 'idle')
}

/* ─────── components ─────── */

function SectionRow({ label, title, desc, right }: { label: string; title: string; desc: string; right?: React.ReactNode }) {
  return (
    <div className="mb-500 flex items-baseline justify-between gap-400 flex-wrap">
      <div className="flex items-baseline gap-400 min-w-0">
        <span className="font-mono text-100 text-signal-blue tabular-nums">[{label}]</span>
        <h2 className="font-mono text-200 font-semibold uppercase tracking-[0.18em] text-ink-primary">{title}</h2>
        <p className="text-100 font-mono text-ink-tertiary truncate">{desc}</p>
      </div>
      {right}
    </div>
  )
}

function MetaBadge({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'green' | 'blue' }) {
  const color =
    tone === 'green' ? 'text-signal-green' :
    tone === 'blue' ? 'text-signal-blue' :
    'text-ink-secondary'
  return (
    <span className="inline-flex items-center gap-200">
      <span className="text-ink-tertiary uppercase tracking-[0.15em] text-[10px]">{label}</span>
      <span className={`${color} font-semibold`}>{value}</span>
    </span>
  )
}

function StatusPill({ status, tokens }: { status: AgentStatus; tokens: number }) {
  const map: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
    idle:     { label: 'IDLE',    cls: 'text-ink-tertiary',  dot: 'bg-ink-tertiary' },
    queued:   { label: 'QUEUED',  cls: 'text-ink-secondary', dot: 'bg-ink-secondary' },
    running:  { label: 'RUNNING', cls: 'text-signal-blue',   dot: 'bg-signal-blue animate-pulseDot' },
    done:     { label: 'DONE',    cls: 'text-signal-green',  dot: 'bg-signal-green' },
    retry:    { label: 'RETRY',   cls: 'text-signal-amber',  dot: 'bg-signal-amber animate-pulseDot' },
  }
  const { label, cls, dot } = map[status]
  return (
    <span className={`inline-flex items-center gap-200 font-mono text-100 ${cls}`}>
      <span className={`w-200 h-200 rounded-full ${dot}`} />
      <span className="font-semibold tracking-wider">{label}</span>
      {status === 'running' && tokens > 0 && (
        <span className="text-ink-tertiary tabular-nums">· <span className="text-ink-secondary">{tokens}</span> tok</span>
      )}
    </span>
  )
}

function formatDuration(start?: number, end?: number): string {
  if (!start) return ''
  const ms = (end ?? Date.now()) - start
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function AgentRow({
  name, state, index, brief, score, wasRetried, isLast,
}: {
  name: AgentName
  state: AgentState
  index: number
  brief?: string
  score?: JudgeScore
  wasRetried: boolean
  isLast: boolean
}) {
  const [open, setOpen] = useState(false)
  const dur = formatDuration(state.startedAt, state.finishedAt)
  return (
    <article className={`${isLast ? '' : 'border-b border-hairline'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-500 py-400 flex items-start gap-400 hover:bg-surface-2 transition-colors duration-150 ease-console">
        <span className="font-mono text-100 text-ink-tertiary tabular-nums shrink-0 pt-100 w-700">
          {String(index).padStart(2, '0')}
        </span>
        <span className="shrink-0 text-ink-secondary pt-100">{AGENT_ICON[name]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-300 flex-wrap">
            <div className="flex items-center gap-300 min-w-0">
              <span className="font-mono text-200 font-semibold text-ink-primary">{name}</span>
              <span className="text-100 text-ink-tertiary">{AGENT_LABEL_ZH[name]}</span>
              {wasRetried && (
                <span className="inline-flex items-center gap-100 font-mono text-100 text-signal-amber">
                  <RotateCw className="w-3 h-3" /> retried
                </span>
              )}
            </div>
            <div className="flex items-center gap-400 shrink-0">
              {dur && <span className="font-mono text-100 text-ink-tertiary tabular-nums">{dur}</span>}
              {score && (
                <span className={`font-mono text-100 tabular-nums ${score.verdict === 'pass' ? 'text-signal-green' : 'text-signal-amber'}`}>
                  {score.total}/100
                </span>
              )}
              <StatusPill status={state.status} tokens={state.tokens} />
              <ChevronDown className={`w-3 h-3 text-ink-tertiary transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {brief && !open && (
            <p className="mt-200 text-100 text-ink-tertiary leading-relaxed line-clamp-2">{brief}</p>
          )}
        </div>
      </button>

      {open && (
        <div className="px-500 pb-500 -mt-100 space-y-300 ml-1100">
          {brief && (
            <div className="rounded-2 bg-surface-2 border border-hairline px-400 py-300">
              <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-200">DISPATCHED BRIEF</div>
              <p className="text-100 text-ink-secondary leading-relaxed">{brief}</p>
            </div>
          )}
          {state.content && (
            <div className="rounded-2 bg-surface-2 border border-hairline px-400 py-300 max-h-[420px] overflow-y-auto">
              <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-200">
                OUTPUT
                {state.status === 'running' && <span className="ml-200 text-signal-blue normal-case tracking-normal">· streaming</span>}
              </div>
              <div
                className="prose-console font-sans text-100 leading-[1.75]"
                dangerouslySetInnerHTML={{ __html: marked.parse(state.content, { breaks: true }) as string }}
              />
            </div>
          )}
          {score && (
            <div className="rounded-2 bg-surface-2 border border-hairline px-400 py-300">
              <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-200">JUDGE REASON</div>
              <p className="text-100 text-ink-secondary leading-relaxed">{score.reason}</p>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function RagHitRow({ hit, rank, isLast }: { hit: RagHit; rank: number; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`${isLast ? '' : 'border-b border-hairline'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-500 py-300 flex items-start gap-400 hover:bg-surface-2 transition-colors duration-150 ease-console">
        <span className="font-mono text-100 text-signal-blue tabular-nums shrink-0 pt-100 w-700">[#{rank}]</span>
        <Database className="w-3.5 h-3.5 shrink-0 text-ink-tertiary mt-100" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-300 flex-wrap">
            <div className="flex items-center gap-300 min-w-0 font-mono text-100">
              <span className="text-ink-primary font-semibold">{hit.source}</span>
              {hit.heading && <span className="text-ink-tertiary">§ {hit.heading}</span>}
            </div>
            <div className="flex items-center gap-300 shrink-0 font-mono text-100">
              <SimBar score={hit.score} />
              <span className="text-signal-blue tabular-nums font-semibold">{hit.score.toFixed(3)}</span>
              <ChevronDown className={`w-3 h-3 text-ink-tertiary transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {!open && (
            <p className="mt-200 text-100 text-ink-tertiary leading-relaxed line-clamp-2">{hit.text.slice(0, 160)}{hit.text.length > 160 ? '…' : ''}</p>
          )}
        </div>
      </button>
      {open && (
        <div className="px-500 pb-400 -mt-100 ml-1100">
          <div className="rounded-2 bg-surface-2 border border-hairline px-400 py-300 text-100 text-ink-secondary leading-relaxed whitespace-pre-wrap">
            {hit.text}
          </div>
        </div>
      )}
    </div>
  )
}

function SimBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  return (
    <span className="hidden md:inline-block w-1300 h-100 rounded-0 bg-hairline overflow-hidden">
      <span className="block h-full bg-signal-blue" style={{ width: `${pct}%` }} />
    </span>
  )
}

function ScoreRow({ score }: { score: JudgeScore }) {
  const cells = [
    { value: score.evidence }, { value: score.logic },
    { value: score.actionability }, { value: score.novelty },
  ]
  return (
    <tr className="border-t border-hairline">
      <td className="px-500 py-300 text-ink-primary font-semibold">{score.agent}</td>
      {cells.map((c, i) => (
        <td key={i} className="px-300 py-300 text-right">
          <ScoreCell value={c.value} />
        </td>
      ))}
      <td className={`px-500 py-300 text-right tabular-nums font-semibold ${score.verdict === 'pass' ? 'text-signal-green' : 'text-signal-amber'}`}>
        {score.total}
      </td>
      <td className="px-500 py-300 text-right">
        <span className={`inline-flex items-center gap-200 ${score.verdict === 'pass' ? 'text-signal-green' : 'text-signal-amber'}`}>
          <span className={`w-200 h-200 rounded-full ${score.verdict === 'pass' ? 'bg-signal-green' : 'bg-signal-amber'}`} />
          {score.verdict === 'pass' ? 'PASS' : 'RETRY'}
        </span>
      </td>
    </tr>
  )
}

function ScoreCell({ value }: { value: number }) {
  const tone =
    value >= 80 ? 'text-signal-green' :
    value >= JUDGE_PASS_THRESHOLD ? 'text-ink-primary' :
    'text-signal-amber'
  return (
    <span className="inline-flex items-center gap-200 justify-end font-mono">
      <span className="hidden lg:inline-block w-700 h-100 rounded-0 bg-hairline overflow-hidden">
        <span className={`block h-full ${value >= JUDGE_PASS_THRESHOLD ? 'bg-signal-green' : 'bg-signal-amber'}`} style={{ width: `${value}%` }} />
      </span>
      <span className={`tabular-nums ${tone}`}>{value}</span>
    </span>
  )
}
