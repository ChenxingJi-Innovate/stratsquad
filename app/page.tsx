'use client'
import { useState, useRef, useEffect } from 'react'
import { marked } from 'marked'
import {
  AlertCircle, Brain, Target, TrendingUp,
  Globe, ShieldAlert, Scale, FileText, RotateCw, Download, Copy, ChevronDown,
  Database, Terminal, Play, Square, Activity, Languages,
} from 'lucide-react'
import type { AgentName, StreamEvent, Subtask, JudgeScore, SubAgent, FullResult, RagHit } from '../lib/types'
import { AGENT_LABEL_ZH, AGENT_LABEL_EN, JUDGE_PASS_THRESHOLD } from '../lib/types'

type Lang = 'zh' | 'en'
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

type Dict = {
  brand_subtitle: string
  runtime_ready: string
  hero_title: string
  hero_desc: string
  pipeline_label: string
  pipeline_lines: string[]
  sec_input: string
  sec_input_desc: string
  q_placeholder: string
  corpus_toggle: string
  corpus_placeholder: string
  chars: string
  load_sample: string
  btn_run: string
  btn_abort: string
  sec_timeline: string
  sec_timeline_desc: string
  sec_rag: string
  rag_desc: (n: number, avg: string) => string
  query_prefix: string
  sec_judge: string
  sec_judge_desc: string
  th_agent: string
  th_evidence: string
  th_logic: string
  th_action: string
  th_novelty: string
  th_total: string
  th_verdict: string
  sec_brief: string
  sec_brief_desc: string
  export_desc: string
  copy_md: string
  download: string
  detail_dispatched: string
  detail_output: string
  detail_streaming: string
  detail_reason: string
  retried: string
  sample_q: string
  sample_corpus: string
  footer_subtitle: string
  footer_credit: string
}

const i18n: Record<Lang, Dict> = {
  zh: {
    brand_subtitle: '多智能体推演控制台',
    runtime_ready: 'stratsquad / 运行时就绪',
    hero_title: '四位 Agent，围绕一个战略问题展开推演。',
    hero_desc: '编排器拆解问题，四位专家 Agent 并行作战，评委 4 维评分，低分触发重生，终稿合成战略简报。每个 token / 每次检索 / 每个分数都在屏幕上。',
    pipeline_label: '流水线',
    pipeline_lines: [
      'orchestrator → 拆解为 4 个子简报',
      'rag.retrieve → top-5 相关片段',
      'competitor · trend · market · risk（并行）',
      `judge → 4 维评分，< ${JUDGE_PASS_THRESHOLD} 触发 retry`,
      'composer → 输出最终战略简报',
    ],
    sec_input: '战略问题',
    sec_input_desc: '原样写问题。可选附行业语料 / 数据片段。',
    q_placeholder: '例：评估 2026 下半年发布一款 MOBA 手游进入东南亚市场的窗口期...',
    corpus_toggle: 'CORPUS · 行业报告 / 数据片段（可选）',
    corpus_placeholder: '粘贴 Niko Partners / 伽马数据 / Sensor Tower 报告片段。',
    chars: '字',
    load_sample: '[载入示例]',
    btn_run: '启动 squad',
    btn_abort: '中止',
    sec_timeline: 'AGENT 时间线',
    sec_timeline_desc: '编排器先出 plan，4 位专家并行作战；评委低于 70 分触发 retry。全程 SSE。',
    sec_rag: 'RAG 检索命中',
    rag_desc: (n, avg) => `bge-m3 1024d · top-${n} cosine · 平均相似度 ${avg}`,
    query_prefix: 'q:',
    sec_judge: '评委评分表',
    sec_judge_desc: `加权: 证据 0.35 · 逻辑 0.25 · 可执行 0.30 · 新颖 0.10 · 通过线 ≥ ${JUDGE_PASS_THRESHOLD}`,
    th_agent: 'agent',
    th_evidence: '证据',
    th_logic: '逻辑',
    th_action: '可执行',
    th_novelty: '新颖',
    th_total: '总分',
    th_verdict: '判定',
    sec_brief: '战略简报终稿',
    sec_brief_desc: 'composer 整合 4 份 sub-agent 输出，给高层看的 markdown.',
    export_desc: 'EXPORT · 完整 JSON（问题 + plan + 4 份输出 + 评分 + 简报）可直接喂 SFT 管线',
    copy_md: '复制 Markdown',
    download: '下载 JSON',
    detail_dispatched: '分派的任务简报',
    detail_output: '输出',
    detail_streaming: '· 流式中',
    detail_reason: '评委评语',
    retried: '已重生',
    sample_q: '评估 2026 下半年发布一款 MOBA 手游进入东南亚市场（重点印尼 / 越南 / 菲律宾）的窗口期、竞品壁垒、商业化路径与主要政策风险，并给出 90 天落地动作清单。',
    sample_corpus: `据 Niko Partners 2025 年度东南亚游戏市场报告，东南亚移动游戏市场规模预计 2026 年达到 76 亿美元，年增长 8.3%。印尼贡献约 35% 份额，越南 22%，菲律宾 14%。

MOBA 品类在东南亚仍是大盘第一，Mobile Legends: Bang Bang 月活约 1.1 亿，Arena of Valor 月活 5500 万。两者合计市占超过 80%。

Sensor Tower 数据显示，2025 Q3 东南亚 MOBA 品类 ARPU 约 4.2 美元，付费率 6.8%，皮肤为主要付费点（占流水 65%）。

电竞生态：MPL Indonesia / Vietnam / Philippines 是 Moonton 旗下赛事，年度奖金 50 万美元级，构成强护城河。

技术趋势：UE5 mobile pipeline、AI 智能匹配、跨端云游戏在 2025 年开始在 MOBA 品类小规模试水。`,
    footer_subtitle: 'multi-agent strategy copilot · deepseek v4 · bge-m3',
    footer_credit: 'track 2 · industrial console · vercel geist + ibm carbon',
  },
  en: {
    brand_subtitle: 'multi-agent inference console',
    runtime_ready: 'stratsquad / runtime ready',
    hero_title: 'A squad of agents, debating one strategy question.',
    hero_desc: 'Orchestrator decomposes the question, four expert agents argue in parallel, a judge scores them, then the composer ships a brief. Every token, every retrieval, every score is on the wire.',
    pipeline_label: 'pipeline',
    pipeline_lines: [
      'orchestrator → 4 sub-briefs',
      'rag.retrieve → top-5 chunks',
      'competitor · trend · market · risk (parallel)',
      `judge → rubric 4-dim, retry < ${JUDGE_PASS_THRESHOLD}`,
      'composer → final brief',
    ],
    sec_input: 'STRATEGY QUESTION',
    sec_input_desc: 'Write the question verbatim. Optional corpus snippets for RAG context.',
    q_placeholder: 'e.g. Evaluate the window for launching a MOBA in SEA in H2 2026...',
    corpus_toggle: 'CORPUS · industry reports / data snippets (optional)',
    corpus_placeholder: 'Paste Niko Partners / Sensor Tower / GameLook report snippets.',
    chars: 'chars',
    load_sample: '[load sample]',
    btn_run: 'run squad',
    btn_abort: 'abort',
    sec_timeline: 'AGENT TIMELINE',
    sec_timeline_desc: 'Orchestrator issues a plan, 4 experts run in parallel, judge below 70 triggers retry. Streamed via SSE.',
    sec_rag: 'RAG HITS',
    rag_desc: (n, avg) => `bge-m3 1024d · top-${n} cosine · avg ${avg}`,
    query_prefix: 'q:',
    sec_judge: 'JUDGE RUBRIC',
    sec_judge_desc: `weighted: evidence 0.35 · logic 0.25 · actionability 0.30 · novelty 0.10 · pass ≥ ${JUDGE_PASS_THRESHOLD}`,
    th_agent: 'agent',
    th_evidence: 'evidence',
    th_logic: 'logic',
    th_action: 'action',
    th_novelty: 'novelty',
    th_total: 'total',
    th_verdict: 'verdict',
    sec_brief: 'COMPOSED BRIEF',
    sec_brief_desc: 'Composer integrates 4 sub-agent outputs into a markdown brief for execs.',
    export_desc: 'EXPORT · full JSON (question + plan + 4 outputs + scores + brief) ready for SFT pipeline',
    copy_md: 'copy md',
    download: 'download json',
    detail_dispatched: 'DISPATCHED BRIEF',
    detail_output: 'OUTPUT',
    detail_streaming: '· streaming',
    detail_reason: 'JUDGE REASON',
    retried: 'retried',
    sample_q: 'Evaluate the 2026 H2 launch window for a new MOBA mobile title entering Southeast Asia (focus Indonesia / Vietnam / Philippines): competitive moat, monetization path, and major policy risks. Include a 90-day execution checklist.',
    sample_corpus: `Per Niko Partners 2025 Annual SEA Games Report, SEA mobile game market is projected at USD 7.6B in 2026, growing 8.3% YoY. Indonesia accounts for ~35%, Vietnam 22%, Philippines 14%.

MOBA remains the #1 category in SEA. Mobile Legends: Bang Bang ~110M MAU, Arena of Valor ~55M MAU. Combined market share > 80%.

Sensor Tower 2025 Q3: SEA MOBA ARPU ~USD 4.2, payer rate 6.8%, skins drive 65% of revenue.

Esports moat: MPL Indonesia / Vietnam / Philippines are Moonton-owned circuits with USD 500K+ annual prize pools.

Tech trends: UE5 mobile pipeline, AI matchmaking, cross-platform cloud gaming entered small-scale MOBA pilots in 2025.`,
    footer_subtitle: 'multi-agent strategy copilot · deepseek v4 · bge-m3',
    footer_credit: 'track 2 · industrial console · vercel geist + ibm carbon',
  },
}

export default function Home() {
  const [lang, setLang] = useState<Lang>('zh')
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

  // restore lang preference on mount
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('stratsquad-lang') : null
    if (saved === 'zh' || saved === 'en') setLang(saved)
  }, [])

  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('stratsquad-lang', lang)
    if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en'
  }, [lang])

  // live elapsed counter
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

  const t = i18n[lang]
  const agentLabels = lang === 'zh' ? AGENT_LABEL_ZH : AGENT_LABEL_EN
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
              <span className="text-ink-secondary">{t.brand_subtitle}</span> · v0.2
            </span>
          </div>
          <div className="flex items-center gap-400 text-100 font-mono text-ink-tertiary">
            <div className="hidden md:flex items-center gap-400">
              <MetaBadge label="model" value="deepseek-v4-flash" />
              <MetaBadge label="embed" value="bge-m3" />
              <MetaBadge label="eval" value="hit@5 90.9%" tone="green" />
            </div>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="inline-flex items-center gap-200 px-300 h-700 rounded-2 border border-hairline text-100 font-mono uppercase tracking-wider text-ink-secondary hover:bg-surface-2 hover:text-ink-primary transition-colors duration-150 ease-console"
              aria-label="toggle language"
            >
              <Languages className="w-3 h-3 text-signal-blue" />
              {lang === 'zh' ? 'EN' : '中'}
            </button>
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
                <span className="uppercase tracking-[0.2em]">{t.runtime_ready}</span>
              </div>
              <h1 className="text-600 sm:text-[44px] font-semibold tracking-[-0.02em] text-ink-primary leading-[1.1] mb-400">
                {t.hero_title}
              </h1>
              <p className="text-300 text-ink-secondary leading-relaxed max-w-xl">
                {t.hero_desc}
              </p>
            </div>
            <div className="rounded-4 border border-hairline bg-surface p-500 font-mono text-100 text-ink-secondary space-y-200">
              <div className="text-ink-tertiary uppercase tracking-[0.18em] text-[10px]">{t.pipeline_label}</div>
              {t.pipeline_lines.map((line, i) => {
                const dotColor =
                  i === 3 ? 'text-signal-amber' :
                  i === 4 ? 'text-signal-green' :
                  'text-signal-blue'
                return (
                  <div key={i}><span className={dotColor}>●</span> {line}</div>
                )
              })}
            </div>
          </div>
        </section>

        {/* INPUT */}
        <section id="input" className="mb-800">
          <SectionRow label="01" title={t.sec_input} desc={t.sec_input_desc} />

          <div className="rounded-4 border border-hairline bg-surface overflow-hidden">
            <textarea
              className="w-full h-44 px-500 py-400 text-200 bg-transparent resize-y outline-none placeholder:text-ink-tertiary leading-relaxed font-sans"
              placeholder={t.q_placeholder}
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />

            <button
              onClick={() => setShowCorpus(v => !v)}
              className="w-full px-500 py-300 flex items-center justify-between text-100 font-mono uppercase tracking-[0.15em] text-ink-secondary border-t border-hairline hover:bg-surface-2 transition-colors duration-150 ease-console"
            >
              <span className="flex items-center gap-200">
                <FileText className="w-3 h-3" />
                {t.corpus_toggle}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-150 ease-console ${showCorpus ? 'rotate-180' : ''}`} />
            </button>
            {showCorpus && (
              <textarea
                className="w-full h-32 px-500 pb-400 text-100 font-mono bg-transparent resize-y outline-none placeholder:text-ink-tertiary leading-relaxed border-t border-hairline"
                placeholder={t.corpus_placeholder}
                value={corpus}
                onChange={e => setCorpus(e.target.value)}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-300 px-500 py-300 border-t border-hairline bg-surface-2/50">
              <div className="flex items-center gap-400 text-100 font-mono text-ink-tertiary">
                <span><span className="text-ink-secondary tabular-nums">{question.length}</span> {t.chars}</span>
                {!question && (
                  <button
                    onClick={() => { setQuestion(t.sample_q); setCorpus(t.sample_corpus); setShowCorpus(true) }}
                    className="inline-flex items-center gap-100 text-signal-blue hover:text-signal-blue-bright transition-colors duration-150 ease-console"
                  >
                    {t.load_sample}
                  </button>
                )}
              </div>
              {running ? (
                <button
                  onClick={abort}
                  className="inline-flex items-center gap-200 px-400 h-900 rounded-4 bg-surface-2 border border-signal-red/40 text-signal-red text-100 font-mono font-semibold uppercase tracking-wider hover:bg-signal-red-soft transition-colors duration-150 ease-console"
                >
                  <Square className="w-3 h-3" fill="currentColor" /> {t.btn_abort}
                </button>
              ) : (
                <button
                  onClick={run}
                  disabled={!question.trim()}
                  className="inline-flex items-center gap-200 px-500 h-900 rounded-4 bg-signal-blue text-white text-100 font-mono font-semibold uppercase tracking-wider hover:bg-signal-blue-bright transition-colors duration-150 ease-console disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Play className="w-3 h-3" fill="currentColor" /> {t.btn_run}
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
              title={t.sec_timeline}
              desc={t.sec_timeline_desc}
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
                  label={agentLabels[name]}
                  state={agents[name]}
                  index={i}
                  brief={plan.find(p => p.agent === name as SubAgent)?.brief}
                  score={scores.find(s => s.agent === name as SubAgent)}
                  wasRetried={retries.includes(name as SubAgent)}
                  isLast={i === AGENT_ORDER.length - 1}
                  t={t}
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
              title={t.sec_rag}
              desc={t.rag_desc(ragHits.length, ragSimAvg.toFixed(3))}
              right={
                <span className="text-100 font-mono text-ink-tertiary truncate max-w-md hidden md:inline">
                  {t.query_prefix} <span className="text-ink-secondary">{ragQuery.slice(0, 60)}{ragQuery.length > 60 ? '…' : ''}</span>
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
              title={t.sec_judge}
              desc={t.sec_judge_desc}
            />
            <div className="rounded-4 border border-hairline bg-surface overflow-x-auto">
              <table className="w-full font-mono text-100">
                <thead>
                  <tr className="border-b border-hairline text-ink-tertiary uppercase tracking-[0.15em] text-[11px]">
                    <th className="text-left px-500 py-300 font-medium">{t.th_agent}</th>
                    <th className="text-right px-300 py-300 font-medium">{t.th_evidence}</th>
                    <th className="text-right px-300 py-300 font-medium">{t.th_logic}</th>
                    <th className="text-right px-300 py-300 font-medium">{t.th_action}</th>
                    <th className="text-right px-300 py-300 font-medium">{t.th_novelty}</th>
                    <th className="text-right px-500 py-300 font-medium">{t.th_total}</th>
                    <th className="text-right px-500 py-300 font-medium">{t.th_verdict}</th>
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
            <SectionRow label="05" title={t.sec_brief} desc={t.sec_brief_desc} />
            <div className="rounded-4 border border-hairline bg-surface p-700 sm:p-900">
              <div
                className="prose-console font-sans text-200 leading-[1.85]"
                dangerouslySetInnerHTML={{ __html: marked.parse(brief, { breaks: true }) as string }}
              />
            </div>
            <div className="mt-500 rounded-4 border border-hairline bg-surface px-500 py-400 flex flex-wrap items-center justify-between gap-300">
              <div className="text-100 font-mono text-ink-tertiary">{t.export_desc}</div>
              <div className="flex items-center gap-200">
                <button onClick={copyBrief} className="inline-flex items-center gap-200 px-300 h-800 rounded-2 border border-hairline text-100 font-mono uppercase tracking-wider text-ink-secondary hover:bg-surface-2 hover:text-ink-primary transition-colors duration-150 ease-console">
                  <Copy className="w-3 h-3" /> {t.copy_md}
                </button>
                <button onClick={downloadResult} className="inline-flex items-center gap-200 px-400 h-800 rounded-2 bg-signal-blue text-white text-100 font-mono font-semibold uppercase tracking-wider hover:bg-signal-blue-bright transition-colors duration-150 ease-console">
                  <Download className="w-3 h-3" /> {t.download}
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
            {t.footer_subtitle}
          </div>
          <div>{t.footer_credit}</div>
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
  name, label, state, index, brief, score, wasRetried, isLast, t,
}: {
  name: AgentName
  label: string
  state: AgentState
  index: number
  brief?: string
  score?: JudgeScore
  wasRetried: boolean
  isLast: boolean
  t: Dict
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
              <span className="text-100 text-ink-tertiary">{label}</span>
              {wasRetried && (
                <span className="inline-flex items-center gap-100 font-mono text-100 text-signal-amber">
                  <RotateCw className="w-3 h-3" /> {t.retried}
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
              <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-200">{t.detail_dispatched}</div>
              <p className="text-100 text-ink-secondary leading-relaxed">{brief}</p>
            </div>
          )}
          {state.content && (
            <div className="rounded-2 bg-surface-2 border border-hairline px-400 py-300 max-h-[420px] overflow-y-auto">
              <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-200">
                {t.detail_output}
                {state.status === 'running' && <span className="ml-200 text-signal-blue normal-case tracking-normal">{t.detail_streaming}</span>}
              </div>
              <div
                className="prose-console font-sans text-100 leading-[1.75]"
                dangerouslySetInnerHTML={{ __html: marked.parse(state.content, { breaks: true }) as string }}
              />
            </div>
          )}
          {score && (
            <div className="rounded-2 bg-surface-2 border border-hairline px-400 py-300">
              <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-200">{t.detail_reason}</div>
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
