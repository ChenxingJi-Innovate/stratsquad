'use client'
import { useState, useRef, useEffect } from 'react'
import { marked } from 'marked'
import {
  AlertCircle, Brain, Target, TrendingUp,
  Globe, ShieldAlert, Scale, FileText, RotateCw, Download, Copy, ChevronDown,
  Database, Terminal, Play, Square, Activity, Languages,
  Check, Ban, Loader,
  Upload, Link as LinkIcon, Trash2, X, ExternalLink,
} from 'lucide-react'
import type { AgentName, StreamEvent, Subtask, JudgeScore, SubAgent, FullResult, RagHit, TrendQueryPlan, TrendResult, TrendSource } from '../lib/types'
import { AGENT_LABEL_ZH, AGENT_LABEL_EN, JUDGE_PASS_THRESHOLD } from '../lib/types'
import { TREND_SOURCE_LABEL_ZH, TREND_SOURCE_LABEL_EN } from '../lib/trends/types'
import type { UserChunk } from '../lib/rag/types'
import {
  GoogleIcon, SteamIcon, TwitchIcon, RedditIcon, YouTubeIcon,
  AppStoreIcon, HuyaIcon, DouyuIcon, BilibiliIcon,
} from '../lib/icons/brands'

const ALL_SOURCES: TrendSource[] = ['google-trends', 'steam', 'twitch', 'reddit', 'youtube', 'appstore', 'huya', 'douyu', 'bilibili']

// Public data dashboard URL that mirrors what each API endpoint actually queries.
// Verified 2026-05-16 — kept in sync with the underlying fetch URLs in lib/trends/*.
const PLATFORM_URL: Record<TrendSource, string> = {
  // Explore is the public mirror of /trends/api/explore + widgetdata/multiline.
  'google-trends': 'https://trends.google.com/trends/explore',
  // Official Steam Charts: most played + top selling, same data as ISteamChartsService/GetMostPlayedGames.
  'steam':         'https://store.steampowered.com/charts/',
  // Directory shows all categories sorted by current viewers, what helix/games/top returns.
  'twitch':        'https://www.twitch.tv/directory/',
  // Mirrors /r/{sub}/search?t=month — top posts of the past 30 days in r/gaming.
  'reddit':        'https://www.reddit.com/r/gaming/top/?t=month',
  // YouTube's Gaming Trending tab; same content surface as videoCategoryId=20 order=viewCount.
  'youtube':       'https://www.youtube.com/gaming/trending',
  // iPhone top charts (free / paid / grossing for Games), iTunes RSS endpoint we hit.
  'appstore':      'https://apps.apple.com/us/charts/iphone',
  // Game directory listing all categories with current viewer/heat counts.
  'huya':          'https://www.huya.com/g',
  // All categories, what getRanklistByCateId aggregates.
  'douyu':         'https://www.douyu.com/directory/all',
  // 热门视频 page; mirrors api.bilibili.com/x/web-interface/popular.
  'bilibili':      'https://www.bilibili.com/v/popular/all/',
}

type KBDocStatus = 'chunking' | 'embedding' | 'ready' | 'failed'
type KBDoc = {
  id: string
  name: string
  kind: 'file' | 'url'
  status: KBDocStatus
  chunks: UserChunk[]
  size: number              // chars
  error?: string
  addedAt: number
}

const TREND_ICON: Record<TrendSource, React.ReactNode> = {
  'google-trends': <GoogleIcon size={14} />,
  'steam':         <SteamIcon size={14} />,
  'twitch':        <TwitchIcon size={14} />,
  'reddit':        <RedditIcon size={14} />,
  'youtube':       <YouTubeIcon size={14} />,
  'appstore':      <AppStoreIcon size={14} />,
  'huya':          <HuyaIcon size={14} />,
  'douyu':         <DouyuIcon size={14} />,
  'bilibili':      <BilibiliIcon size={14} />,
}

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
  eyebrow_issue: string
  eyebrow_status: string
  hero_pre: string
  hero_emphasis: string
  hero_post: string
  hero_desc: string
  spec_strip: string[]
  pipeline_label: string
  pipeline_lines: string[]
  pipeline_nodes: { agents: AgentName[] | AgentName; label: string }[]
  sec_input: string
  sec_input_desc: string
  q_placeholder: string
  platforms_label: string
  platforms_desc: (n: number) => string
  platforms_all: string
  platforms_clear: string
  kb_label: string
  kb_desc: string
  kb_drop: string
  kb_url_placeholder: string
  kb_ingest_btn: string
  kb_remove: string
  kb_chunks: (n: number) => string
  kb_status_chunking: string
  kb_status_embedding: string
  kb_status_ready: string
  kb_status_failed: string
  chars: string
  btn_run: string
  btn_abort: string
  sec_timeline: string
  sec_timeline_desc: string
  sec_rag: string
  rag_desc: (n: number, avg: string) => string
  query_prefix: string
  sec_data: string
  sec_data_desc: (n: number, ok: number) => string
  data_rationale: string
  data_no_plan: string
  data_pending: string
  data_failed: string
  th_source_status: string
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
  footer_subtitle: string
  footer_credit: string
}

const i18n: Record<Lang, Dict> = {
  zh: {
    brand_subtitle: '多智能体推演控制台',
    runtime_ready: 'stratsquad / 运行时就绪',
    eyebrow_issue: 'ISSUE 02 · STRATEGY CONSOLE · V0.3',
    eyebrow_status: 'STREAMING',
    hero_pre: '四位 Agent，围绕一个战略问题展开',
    hero_emphasis: '推演',
    hero_post: '。',
    hero_desc: '编排器拆解 · 4 专家并行 · 9 源实时趋势 · BGE-M3 hybrid RAG + reranker · 评委门控 · 全程 SSE',
    spec_strip: ['DEEPSEEK V4', '9 LIVE SOURCES', 'BGE-M3 + RERANKER', 'JUDGE-GATED', 'STREAMING'],
    pipeline_label: '流水线',
    pipeline_lines: [
      'orchestrator → 拆解为 4 个子简报',
      'rag.retrieve → top-5 相关片段',
      'competitor · trend · market · risk（并行）',
      `judge → 4 维评分，< ${JUDGE_PASS_THRESHOLD} 触发 retry`,
      'composer → 输出最终战略简报',
    ],
    pipeline_nodes: [
      { agents: 'orchestrator', label: 'orchestrator · 拆解 4 个子简报' },
      { agents: 'orchestrator', label: 'rag + 9 源 trend planner' },
      { agents: ['competitor', 'trend', 'market', 'risk'], label: 'competitor · trend · market · risk（并行）' },
      { agents: 'judge', label: `judge · 4 维评分，< ${JUDGE_PASS_THRESHOLD} 触发 retry` },
      { agents: 'composer', label: 'composer · 终稿战略简报' },
    ],
    sec_input: '战略问题',
    sec_input_desc: '',
    q_placeholder: '例：评估 2026 下半年发布一款 MOBA 手游进入东南亚市场的窗口期...',
    platforms_label: '数据源',
    platforms_desc: n => `${n}/9 启用`,
    platforms_all: '全选',
    platforms_clear: '全清',
    kb_label: '知识库',
    kb_desc: 'BGE-M3 embed + BGE-reranker',
    kb_drop: '拖入 .md / .txt / .csv / .json 文件，或点击选择',
    kb_url_placeholder: '或粘贴一个 URL (会抓取页面文本)',
    kb_ingest_btn: '拉取并入库',
    kb_remove: '移除',
    kb_chunks: n => `${n} chunk`,
    kb_status_chunking: 'CHUNKING',
    kb_status_embedding: 'EMBEDDING',
    kb_status_ready: 'READY',
    kb_status_failed: 'FAILED',
    chars: '字',
    btn_run: '启动 squad',
    btn_abort: '中止',
    sec_timeline: 'AGENT 时间线',
    sec_timeline_desc: 'orchestrator → 4 并行 → judge → composer',
    sec_rag: 'RAG 检索',
    rag_desc: (n, avg) => `bge-m3 · top-${n} · avg ${avg}`,
    query_prefix: 'q:',
    sec_data: '实时趋势',
    sec_data_desc: (n, ok) => `${ok}/${n} 命中`,
    data_rationale: '采集策略',
    data_no_plan: '本轮未选源',
    data_pending: '采集中',
    data_failed: 'FAILED',
    th_source_status: '状态',
    sec_judge: '评委评分',
    sec_judge_desc: `证据 0.35 · 逻辑 0.25 · 可执行 0.30 · 新颖 0.10 · pass ≥ ${JUDGE_PASS_THRESHOLD}`,
    th_agent: 'agent',
    th_evidence: '证据',
    th_logic: '逻辑',
    th_action: '可执行',
    th_novelty: '新颖',
    th_total: '总分',
    th_verdict: '判定',
    sec_brief: '战略简报',
    sec_brief_desc: 'markdown',
    export_desc: '完整 JSON · 可直接进 SFT 管线',
    copy_md: '复制 Markdown',
    download: '下载 JSON',
    detail_dispatched: '分派任务',
    detail_output: '输出',
    detail_streaming: '· 流式',
    detail_reason: '评语',
    retried: '已重生',
    footer_subtitle: 'multi-agent strategy copilot · deepseek v4 · bge-m3 · bge-reranker',
    footer_credit: 'track 2 · industrial console · vercel geist + ibm carbon',
  },
  en: {
    brand_subtitle: 'multi-agent inference console',
    runtime_ready: 'stratsquad / runtime ready',
    eyebrow_issue: 'ISSUE 02 · STRATEGY CONSOLE · V0.3',
    eyebrow_status: 'STREAMING',
    hero_pre: 'A squad of agents, ',
    hero_emphasis: 'debating',
    hero_post: ' one strategy question.',
    hero_desc: 'Orchestrator decomposes · 4 experts parallel · 9 live trend sources · BGE-M3 hybrid RAG + reranker · judge-gated · full SSE',
    spec_strip: ['DEEPSEEK V4', '9 LIVE SOURCES', 'BGE-M3 + RERANKER', 'JUDGE-GATED', 'STREAMING'],
    pipeline_label: 'pipeline',
    pipeline_lines: [
      'orchestrator → 4 sub-briefs',
      'rag.retrieve → top-5 chunks',
      'competitor · trend · market · risk (parallel)',
      `judge → rubric 4-dim, retry < ${JUDGE_PASS_THRESHOLD}`,
      'composer → final brief',
    ],
    pipeline_nodes: [
      { agents: 'orchestrator', label: 'orchestrator · 4 sub-briefs' },
      { agents: 'orchestrator', label: 'rag + 9-source trend planner' },
      { agents: ['competitor', 'trend', 'market', 'risk'], label: 'competitor · trend · market · risk (parallel)' },
      { agents: 'judge', label: `judge · 4-dim rubric, retry < ${JUDGE_PASS_THRESHOLD}` },
      { agents: 'composer', label: 'composer · final brief' },
    ],
    sec_input: 'STRATEGY QUESTION',
    sec_input_desc: '',
    q_placeholder: 'e.g. Evaluate the window for launching a MOBA in SEA in H2 2026...',
    platforms_label: 'data sources',
    platforms_desc: n => `${n}/9 active`,
    platforms_all: 'all',
    platforms_clear: 'none',
    kb_label: 'knowledge base',
    kb_desc: 'BGE-M3 embed + BGE-reranker',
    kb_drop: 'drop .md / .txt / .csv / .json here, or click to browse',
    kb_url_placeholder: 'or paste a URL (page text will be fetched)',
    kb_ingest_btn: 'ingest',
    kb_remove: 'remove',
    kb_chunks: n => `${n} chunks`,
    kb_status_chunking: 'CHUNKING',
    kb_status_embedding: 'EMBEDDING',
    kb_status_ready: 'READY',
    kb_status_failed: 'FAILED',
    chars: 'chars',
    btn_run: 'run squad',
    btn_abort: 'abort',
    sec_timeline: 'AGENT TIMELINE',
    sec_timeline_desc: 'orchestrator → 4 parallel → judge → composer',
    sec_rag: 'RAG HITS',
    rag_desc: (n, avg) => `bge-m3 · top-${n} · avg ${avg}`,
    query_prefix: 'q:',
    sec_data: 'LIVE TRENDS',
    sec_data_desc: (n, ok) => `${ok}/${n} resolved`,
    data_rationale: 'selection rationale',
    data_no_plan: 'no sources picked',
    data_pending: 'fetching',
    data_failed: 'FAILED',
    th_source_status: 'status',
    sec_judge: 'JUDGE',
    sec_judge_desc: `evidence 0.35 · logic 0.25 · action 0.30 · novelty 0.10 · pass ≥ ${JUDGE_PASS_THRESHOLD}`,
    th_agent: 'agent',
    th_evidence: 'evidence',
    th_logic: 'logic',
    th_action: 'action',
    th_novelty: 'novelty',
    th_total: 'total',
    th_verdict: 'verdict',
    sec_brief: 'BRIEF',
    sec_brief_desc: 'markdown',
    export_desc: 'full JSON · SFT-ready',
    copy_md: 'copy md',
    download: 'json',
    detail_dispatched: 'DISPATCHED',
    detail_output: 'OUTPUT',
    detail_streaming: '· streaming',
    detail_reason: 'REASON',
    retried: 'retried',
    footer_subtitle: 'multi-agent strategy copilot · deepseek v4 · bge-m3 · bge-reranker',
    footer_credit: 'track 2 · industrial console · vercel geist + ibm carbon',
  },
}

export default function Home() {
  const [lang, setLang] = useState<Lang>('zh')
  const [question, setQuestion] = useState('')
  const [enabledSources, setEnabledSources] = useState<Record<TrendSource, boolean>>(
    Object.fromEntries(ALL_SOURCES.map(s => [s, true])) as Record<TrendSource, boolean>,
  )
  const [kbDocs, setKbDocs] = useState<KBDoc[]>([])
  const [kbUrl, setKbUrl] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<Record<AgentName, AgentState>>(initAgents())
  const [plan, setPlan] = useState<Subtask[]>([])
  const [ragHits, setRagHits] = useState<RagHit[]>([])
  const [ragQuery, setRagQuery] = useState('')
  const [trendPlan, setTrendPlan] = useState<TrendQueryPlan | null>(null)
  const [trendResults, setTrendResults] = useState<TrendResult[]>([])
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
    setPlan([]); setRagHits([]); setRagQuery('')
    setTrendPlan(null); setTrendResults([])
    setScores([]); setRetries([]); setBrief(''); setError('')
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

    const userChunks: UserChunk[] = kbDocs.flatMap(d => d.status === 'ready' ? d.chunks : [])
    const enabled = ALL_SOURCES.filter(s => enabledSources[s])

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, enabledSources: enabled, userChunks }),
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

  function toggleSource(s: TrendSource) {
    setEnabledSources(prev => ({ ...prev, [s]: !prev[s] }))
  }

  function removeKbDoc(id: string) {
    setKbDocs(prev => prev.filter(d => d.id !== id))
  }

  // Common ingest flow: POST text or URL to /api/kb/ingest, parse SSE stream, update KBDoc by id.
  async function streamIngest(docId: string, body: object) {
    try {
      const res = await fetch('/api/kb/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) throw new Error(await res.text() || `HTTP ${res.status}`)

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
            const ev = JSON.parse(payload)
            handleKbEvent(docId, ev)
          } catch { /* malformed line */ }
        }
      }
    } catch (e: any) {
      setKbDocs(prev => prev.map(d => d.id === docId ? { ...d, status: 'failed', error: e?.message ?? 'ingest failed' } : d))
    }
  }

  function handleKbEvent(docId: string, ev: any) {
    setKbDocs(prev => prev.map(d => {
      if (d.id !== docId) return d
      if (ev.type === 'chunking') return { ...d, status: 'chunking', size: ev.size ?? d.size }
      if (ev.type === 'embedding') return { ...d, status: 'embedding' }
      if (ev.type === 'ready')    return { ...d, status: 'ready', chunks: ev.chunks ?? [] }
      if (ev.type === 'error')    return { ...d, status: 'failed', error: ev.message }
      return d
    }))
  }

  async function ingestFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    for (const f of arr) {
      const text = await f.text()
      const id = crypto.randomUUID()
      const doc: KBDoc = { id, name: f.name, kind: 'file', status: 'chunking', chunks: [], size: text.length, addedAt: Date.now() }
      setKbDocs(prev => [...prev, doc])
      streamIngest(id, { name: f.name, text })
    }
  }

  async function ingestUrl(url: string) {
    if (!url.trim()) return
    let host = url
    try { host = new URL(url).hostname } catch { /* keep as-is */ }
    const id = crypto.randomUUID()
    const doc: KBDoc = { id, name: host, kind: 'url', status: 'chunking', chunks: [], size: 0, addedAt: Date.now() }
    setKbDocs(prev => [...prev, doc])
    setKbUrl('')
    streamIngest(id, { name: host, url })
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
      case 'trend_plan':
        setTrendPlan(ev.plan)
        break
      case 'trend_result':
        setTrendResults(prev => {
          // Dedupe by full query identity so multi-query-per-source (e.g., appstore US + CN) all show.
          const key = JSON.stringify(ev.result.query)
          const filtered = prev.filter(r => JSON.stringify(r.query) !== key)
          return [...filtered, ev.result]
        })
        break
      case 'trend_bundle':
        // bundle is the aggregate; already have individual results, but persist for download
        setTrendResults(ev.bundle.results)
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
      trendBundle: trendPlan ? { plan: trendPlan, results: trendResults } : null,
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
        {/* HERO — editorial-grade Track 2: eyebrow strip, massive type, spec strip, side pipeline */}
        <section className="pt-700 pb-1000 relative">
          <div className="hero-backdrop" aria-hidden />

          {/* Eyebrow strip: issue label + status pulse */}
          <div className="relative flex items-center justify-between gap-400 mb-700 text-[10px] font-mono tracking-[0.22em] uppercase">
            <span className="text-ink-tertiary">{t.eyebrow_issue}</span>
            <span className="flex items-center gap-200 text-signal-green">
              <span className="w-[6px] h-[6px] rounded-full bg-signal-green animate-pulseDot" />
              {t.eyebrow_status}
            </span>
          </div>

          <div className="relative grid lg:grid-cols-[1.7fr_1fr] gap-900 items-end">
            <div>
              <h1
                className="font-semibold text-ink-primary leading-[0.98] mb-600"
                style={{ fontSize: 'clamp(48px, 7.8vw, 96px)', letterSpacing: '-0.045em' }}
              >
                {t.hero_pre}
                <span className="text-signal-blue">{t.hero_emphasis}</span>
                <span className="text-signal-blue">{t.hero_post}</span>
              </h1>
              <p className="text-300 text-ink-secondary leading-relaxed max-w-2xl">
                {t.hero_desc}
              </p>
            </div>
            <PipelinePanel
              label={t.pipeline_label}
              nodes={t.pipeline_nodes}
              agents={agents}
              running={running}
            />
          </div>

          {/* Spec strip — hairline-separated metadata in mono caps, Vercel/Linear pattern */}
          <div className="relative mt-1000 border-t border-hairline pt-400 flex flex-wrap items-center gap-x-700 gap-y-200">
            {t.spec_strip.map((label, i) => (
              <span
                key={i}
                className={`text-[10px] font-mono tracking-[0.22em] uppercase ${
                  i === t.spec_strip.length - 1 ? 'text-signal-green' : 'text-ink-tertiary'
                }`}
              >
                {i === t.spec_strip.length - 1 && (
                  <span className="inline-block w-[6px] h-[6px] rounded-full bg-signal-green animate-pulseDot mr-200 align-middle" />
                )}
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* INPUT */}
        <section id="input" className="mb-1200">
          <SectionRow label="01" title={t.sec_input} desc={t.sec_input_desc} />

          <div className="rounded-4 border border-hairline bg-surface overflow-hidden">
            <textarea
              className="w-full h-44 px-500 py-400 text-200 bg-transparent resize-y outline-none placeholder:text-ink-tertiary leading-relaxed font-sans"
              placeholder={t.q_placeholder}
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />

            <PlatformPicker
              enabled={enabledSources}
              onToggle={toggleSource}
              onSelectAll={() => setEnabledSources(Object.fromEntries(ALL_SOURCES.map(s => [s, true])) as Record<TrendSource, boolean>)}
              onClear={() => setEnabledSources(Object.fromEntries(ALL_SOURCES.map(s => [s, false])) as Record<TrendSource, boolean>)}
              lang={lang}
              t={t}
            />

            <KBConnectPanel
              docs={kbDocs}
              urlInput={kbUrl}
              onUrlChange={setKbUrl}
              onFiles={ingestFiles}
              onUrlIngest={ingestUrl}
              onRemove={removeKbDoc}
              t={t}
            />

            <div className="flex flex-wrap items-center justify-between gap-300 px-500 py-300 border-t border-hairline bg-surface-2/50">
              <div className="flex items-center gap-400 text-100 font-mono text-ink-tertiary">
                <span><span className="text-ink-secondary tabular-nums">{question.length}</span> {t.chars}</span>
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
          <section className="mb-1200 animate-fadeIn">
            <SectionRow
              label="02"
              title={t.sec_timeline}
              desc={t.sec_timeline_desc}
              right={
                <div className="flex items-center gap-400 text-100 font-mono text-ink-tertiary">
                  <span className="inline-flex items-center gap-100">
                    <Activity className="w-3 h-3" />
                    <RollingNumber value={elapsed.toFixed(1)} className="text-ink-primary" />
                    <span>s</span>
                  </span>
                  <span className="inline-flex items-center gap-100">
                    <RollingNumber value={String(totalTokens)} className="text-ink-primary" />
                    <span>tok</span>
                  </span>
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
          <section className="mb-1200 animate-fadeIn">
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

        {/* DATA QUERY (LIVE TREND SOURCES) */}
        {(trendPlan || trendResults.length > 0) && (
          <section className="mb-1200 animate-fadeIn">
            <SectionRow
              label="04"
              title={t.sec_data}
              desc={t.sec_data_desc(
                trendPlan?.queries.length ?? 0,
                trendResults.filter(r => r.ok).length,
              )}
            />

            <div className="rounded-4 border border-hairline bg-surface overflow-hidden">
              {trendPlan && trendPlan.rationale && (
                <div className="px-500 py-400 border-b border-hairline bg-surface-2/40">
                  <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-200">
                    {t.data_rationale}
                  </div>
                  <p className="text-200 text-ink-secondary leading-relaxed">{trendPlan.rationale}</p>
                </div>
              )}
              {trendPlan && trendPlan.queries.length === 0 && (
                <div className="px-500 py-500 text-100 font-mono text-ink-tertiary">
                  {t.data_no_plan}
                </div>
              )}
              {trendPlan && trendPlan.queries.map((q, i) => {
                const result = trendResults.find(r => JSON.stringify(r.query) === JSON.stringify(q))
                return (
                  <TrendQueryRow
                    key={`${q.source}-${i}`}
                    source={q.source}
                    queryParams={q}
                    result={result}
                    isLast={i === trendPlan.queries.length - 1}
                    t={t}
                    lang={lang}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* JUDGE GRID */}
        {scores.length > 0 && (
          <section className="mb-1200 animate-fadeIn">
            <SectionRow
              label="05"
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
          <section className="mb-1200 animate-fadeIn">
            <SectionRow label="06" title={t.sec_brief} desc={t.sec_brief_desc} />
            <div className="rounded-4 border border-hairline bg-surface p-700 sm:p-900">
              <div
                className="prose-console prose-brief font-sans text-200 leading-[1.85]"
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

// Editorial section header — Vercel/Linear pattern:
// numbered counter (01 / 06), full-width hairline rule, then label + desc.
function SectionRow({ label, title, desc, right }: { label: string; title: string; desc: string; right?: React.ReactNode }) {
  return (
    <div className="mb-500">
      <div className="flex items-center gap-400 mb-300 text-[10px] font-mono tracking-[0.22em] uppercase">
        <span className="text-signal-blue tabular-nums">{label} / 06</span>
        <span className="flex-1 border-t border-hairline" />
        {right}
      </div>
      <div className="flex items-baseline gap-400 flex-wrap">
        <h2 className="font-mono text-300 font-semibold uppercase tracking-[0.12em] text-ink-primary">{title}</h2>
        {desc && <p className="text-100 font-mono text-ink-tertiary">{desc}</p>}
      </div>
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
  // Hairline tick scale: 11 ticks, fill from left up to score (0..1) bucket. Each lit tick reveals 60ms after the previous.
  const total = 11
  const lit = Math.max(0, Math.min(total, Math.round(score * total)))
  return (
    <span className="hidden md:inline-flex items-center gap-[2px] h-[10px]" aria-label={`similarity ${(score * 100).toFixed(0)}%`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`tick-on inline-block w-[3px] h-[10px] ${
            i < lit ? 'bg-signal-blue' : 'bg-hairline-strong opacity-60'
          }`}
          style={{ animationDelay: i < lit ? `${i * 60}ms` : '0ms' }}
        />
      ))}
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

function TrendQueryRow({
  source, queryParams, result, isLast, t, lang,
}: {
  source: TrendSource
  queryParams: import('../lib/trends/types').TrendQuery
  result: TrendResult | undefined
  isLast: boolean
  t: Dict
  lang: Lang
}) {
  const [open, setOpen] = useState(false)
  const label = lang === 'zh' ? TREND_SOURCE_LABEL_ZH[source] : TREND_SOURCE_LABEL_EN[source]
  const params: string[] = []
  if (queryParams.keywords?.length) params.push(`kw: ${queryParams.keywords.join(', ')}`)
  if (queryParams.region) params.push(`region: ${queryParams.region}`)
  if (queryParams.gameTitles?.length) params.push(`games: ${queryParams.gameTitles.join(', ')}`)
  if (queryParams.subreddits?.length) params.push(`subs: ${queryParams.subreddits.map(s => 'r/' + s).join(', ')}`)
  if (queryParams.category) params.push(`cat: ${queryParams.category}`)
  if (queryParams.timeframe) params.push(`tf: ${queryParams.timeframe}`)

  return (
    <div className={`${isLast ? '' : 'border-b border-hairline'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-500 py-400 flex items-start gap-400 hover:bg-surface-2 transition-colors duration-150 ease-console">
        <span className="shrink-0 text-ink-secondary pt-100">{TREND_ICON[source]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-300 flex-wrap">
            <div className="flex items-center gap-300 min-w-0 font-mono">
              <span className="text-200 font-semibold text-ink-primary">{label}</span>
              <span className="text-100 text-ink-tertiary truncate">{params.join(' · ')}</span>
            </div>
            <div className="flex items-center gap-300 shrink-0 font-mono text-100">
              <TrendStatusBadge result={result} pendingLabel={t.data_pending} failedLabel={t.data_failed} />
              <ChevronDown className={`w-3 h-3 text-ink-tertiary transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {result?.ok && !open && (
            <p className="mt-200 text-100 text-ink-tertiary leading-relaxed line-clamp-2">{result.summary}</p>
          )}
          {result && !result.ok && !open && (
            <p className="mt-200 text-100 text-signal-amber leading-relaxed line-clamp-2 font-mono">{result.error}</p>
          )}
        </div>
      </button>
      {open && result?.ok && (
        <div className="px-500 pb-400 -mt-100 ml-1100">
          <div className="rounded-2 bg-surface-2 border border-hairline px-400 py-300 max-h-[360px] overflow-y-auto">
            <div
              className="prose-console font-sans text-100 leading-[1.7]"
              dangerouslySetInnerHTML={{ __html: marked.parse(result.digest, { breaks: true }) as string }}
            />
          </div>
          {result.datapoints && result.datapoints.length > 0 && (
            <DatapointSpark points={result.datapoints} />
          )}
        </div>
      )}
      {open && result && !result.ok && (
        <div className="px-500 pb-400 -mt-100 ml-1100">
          <div className="rounded-2 bg-surface-2 border border-signal-amber/30 px-400 py-300">
            <div className="text-100 font-mono uppercase tracking-[0.15em] text-signal-amber mb-200">error</div>
            <p className="text-100 font-mono text-ink-secondary leading-relaxed">{result.error}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function TrendStatusBadge({ result, pendingLabel, failedLabel }: { result: TrendResult | undefined; pendingLabel: string; failedLabel: string }) {
  if (!result) {
    return (
      <span className="inline-flex items-center gap-200 text-signal-blue">
        <Loader className="w-3 h-3 animate-spin" />
        <span className="font-semibold tracking-wider uppercase">{pendingLabel}</span>
      </span>
    )
  }
  if (result.ok) {
    return (
      <span className="inline-flex items-center gap-200 text-signal-green">
        <Check className="w-3 h-3" strokeWidth={2} />
        <span className="font-semibold tracking-wider">OK</span>
        <span className="text-ink-tertiary tabular-nums">{result.latencyMs}ms</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-200 text-signal-amber">
      <Ban className="w-3 h-3" strokeWidth={2} />
      <span className="font-semibold tracking-wider">{failedLabel}</span>
    </span>
  )
}

function DatapointSpark({ points }: { points: Array<{ label: string; value: number; meta?: Record<string, string | number> }> }) {
  const max = Math.max(...points.map(p => p.value), 1)
  return (
    <div className="mt-300 rounded-2 bg-surface-2 border border-hairline px-400 py-300">
      <div className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary mb-300">datapoints · top {points.length}</div>
      <div className="space-y-200">
        {points.slice(0, 10).map((p, i) => (
          <div key={i} className="flex items-center gap-300 font-mono text-100">
            <span className="text-ink-tertiary tabular-nums shrink-0 w-700">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-ink-secondary truncate flex-1 min-w-0">{p.label}</span>
            <span className="inline-block w-1600 h-100 bg-hairline overflow-hidden shrink-0">
              <span className="block h-full bg-signal-blue" style={{ width: `${(p.value / max) * 100}%` }} />
            </span>
            <span className="text-ink-primary tabular-nums shrink-0 w-1100 text-right">{fmtNumDisplay(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmtNumDisplay(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

// Platform picker: 9 source chips, toggleable. Default all on. Disabled sources are filtered
// out of the trend planner's pick list server-side.
function PlatformPicker({
  enabled, onToggle, onSelectAll, onClear, lang, t,
}: {
  enabled: Record<TrendSource, boolean>
  onToggle: (s: TrendSource) => void
  onSelectAll: () => void
  onClear: () => void
  lang: Lang
  t: Dict
}) {
  const labels = lang === 'zh' ? TREND_SOURCE_LABEL_ZH : TREND_SOURCE_LABEL_EN
  const enabledCount = ALL_SOURCES.filter(s => enabled[s]).length
  return (
    <div className="border-t border-hairline px-500 py-400">
      <div className="flex items-center justify-between mb-300">
        <div className="flex items-center gap-300">
          <span className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary">{t.platforms_label}</span>
          <span className="text-100 font-mono text-ink-tertiary tabular-nums">{t.platforms_desc(enabledCount)}</span>
        </div>
        <div className="flex items-center gap-200 text-100 font-mono">
          <button onClick={onSelectAll} className="text-signal-blue hover:text-signal-blue-bright">{t.platforms_all}</button>
          <span className="text-ink-tertiary">·</span>
          <button onClick={onClear} className="text-ink-tertiary hover:text-signal-amber">{t.platforms_clear}</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-200">
        {ALL_SOURCES.map(s => {
          const on = enabled[s]
          return (
            <div
              key={s}
              className={`inline-flex items-stretch rounded-2 border overflow-hidden transition-colors duration-150 ease-console ${
                on
                  ? 'border-signal-blue/60 bg-signal-blue-soft/60'
                  : 'border-hairline hover:border-hairline-strong'
              }`}
            >
              <button
                onClick={() => onToggle(s)}
                className={`inline-flex items-center gap-200 h-700 px-300 text-100 font-mono ${
                  on ? 'text-signal-blue-bright' : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
                aria-pressed={on}
              >
                <span className={on ? 'text-signal-blue' : 'text-ink-tertiary'}>{TREND_ICON[s]}</span>
                <span>{labels[s]}</span>
              </button>
              <a
                href={PLATFORM_URL[s]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`open ${labels[s]}`}
                title={PLATFORM_URL[s]}
                className={`inline-flex items-center justify-center w-700 border-l ${
                  on ? 'border-signal-blue/40 text-signal-blue hover:bg-signal-blue/10' : 'border-hairline text-ink-tertiary hover:text-signal-blue hover:bg-surface-2'
                } transition-colors duration-150 ease-console`}
              >
                <ExternalLink className="w-3 h-3" strokeWidth={1.8} />
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// KB connect panel: drag-drop file upload + URL ingest + uploaded doc list.
function KBConnectPanel({
  docs, urlInput, onUrlChange, onFiles, onUrlIngest, onRemove, t,
}: {
  docs: KBDoc[]
  urlInput: string
  onUrlChange: (v: string) => void
  onFiles: (files: FileList | File[]) => void
  onUrlIngest: (url: string) => void
  onRemove: (id: string) => void
  t: Dict
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="border-t border-hairline px-500 py-400">
      <div className="flex items-center gap-300 mb-300">
        <span className="text-100 font-mono uppercase tracking-[0.15em] text-ink-tertiary">{t.kb_label}</span>
        <span className="text-100 font-mono text-ink-tertiary">{t.kb_desc}</span>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files)
        }}
        className={`rounded-2 border border-dashed px-400 py-500 text-center cursor-pointer transition-colors duration-150 ease-console ${
          dragOver ? 'border-signal-blue bg-signal-blue-soft/40' : 'border-hairline-strong hover:border-signal-blue/50 bg-surface-2/30'
        }`}
      >
        <Upload className="inline w-4 h-4 mb-200 text-ink-tertiary" strokeWidth={1.5} />
        <div className="text-100 font-mono text-ink-tertiary">{t.kb_drop}</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,.csv,.json,.markdown"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files && e.target.files.length > 0) onFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* URL input */}
      <div className="mt-300 flex items-center gap-200">
        <div className="flex-1 flex items-center gap-200 px-300 h-800 rounded-2 border border-hairline bg-surface-2/30 focus-within:border-signal-blue/50">
          <LinkIcon className="w-3 h-3 text-ink-tertiary shrink-0" />
          <input
            value={urlInput}
            onChange={e => onUrlChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onUrlIngest(urlInput) }}
            placeholder={t.kb_url_placeholder}
            className="flex-1 bg-transparent outline-none text-100 font-mono text-ink-primary placeholder:text-ink-tertiary"
          />
        </div>
        <button
          onClick={() => onUrlIngest(urlInput)}
          disabled={!urlInput.trim()}
          className="inline-flex items-center gap-200 px-400 h-800 rounded-2 bg-signal-blue text-white text-100 font-mono font-semibold uppercase tracking-wider hover:bg-signal-blue-bright transition-colors duration-150 ease-console disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t.kb_ingest_btn}
        </button>
      </div>

      {/* Uploaded docs */}
      {docs.length > 0 && (
        <div className="mt-400 space-y-200">
          {docs.map(d => <KBDocRow key={d.id} doc={d} onRemove={onRemove} t={t} />)}
        </div>
      )}
    </div>
  )
}

function KBDocRow({ doc, onRemove, t }: { doc: KBDoc; onRemove: (id: string) => void; t: Dict }) {
  const statusBadge = (() => {
    if (doc.status === 'chunking') return { label: t.kb_status_chunking, color: 'text-signal-blue', icon: <Loader className="w-3 h-3 animate-spin" /> }
    if (doc.status === 'embedding') return { label: t.kb_status_embedding, color: 'text-signal-blue', icon: <Loader className="w-3 h-3 animate-spin" /> }
    if (doc.status === 'ready')    return { label: t.kb_status_ready,    color: 'text-signal-green', icon: <Check className="w-3 h-3" /> }
    return { label: t.kb_status_failed, color: 'text-signal-amber', icon: <Ban className="w-3 h-3" /> }
  })()
  return (
    <div className="flex items-center justify-between gap-300 px-300 h-800 rounded-2 border border-hairline bg-surface-2/40">
      <div className="flex items-center gap-300 min-w-0 flex-1">
        <span className={`shrink-0 ${statusBadge.color}`}>{statusBadge.icon}</span>
        <span className="text-100 font-mono text-ink-primary truncate">{doc.name}</span>
        <span className="shrink-0 text-100 font-mono text-ink-tertiary">{t.kb_chunks(doc.chunks.length)}</span>
        <span className={`shrink-0 text-100 font-mono font-semibold tracking-wider ${statusBadge.color}`}>{statusBadge.label}</span>
        {doc.error && <span className="text-100 font-mono text-signal-amber truncate">{doc.error}</span>}
      </div>
      <button
        onClick={() => onRemove(doc.id)}
        aria-label={t.kb_remove}
        className="shrink-0 text-ink-tertiary hover:text-signal-amber transition-colors duration-150"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// Rolling number: re-mounts each digit on value change to trigger the rollUp animation.
function RollingNumber({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex tabular-nums ${className ?? ''}`}>
      {value.split('').map((ch, i) => (
        <span key={`${i}-${ch}`} className="roll-num inline-block" style={{ minWidth: ch === '.' ? '4px' : '0.7ch' }}>
          {ch}
        </span>
      ))}
    </span>
  )
}

// Pipeline panel: vertical flow diagram with status-aware nodes and animated connectors.
// Connectors animate (stroke-dashoffset) when any agent in their adjacent node is running.
function PipelinePanel({
  label, nodes, agents, running,
}: {
  label: string
  nodes: { agents: AgentName[] | AgentName; label: string }[]
  agents: Record<AgentName, AgentState>
  running: boolean
}) {
  // Compute a node's status as the highest-priority status among its agent(s):
  // running > retry > done > queued > idle. Composite nodes (4-parallel) summarize.
  function statusOf(group: AgentName[] | AgentName): AgentStatus {
    const arr = Array.isArray(group) ? group : [group]
    const states = arr.map(a => agents[a]?.status ?? 'idle')
    if (states.some(s => s === 'running')) return 'running'
    if (states.some(s => s === 'retry')) return 'retry'
    if (states.every(s => s === 'done')) return 'done'
    if (states.some(s => s === 'queued')) return 'queued'
    return 'idle'
  }

  const nodeStatuses = nodes.map(n => statusOf(n.agents))

  function dotColor(s: AgentStatus): string {
    switch (s) {
      case 'running': return 'bg-signal-blue'
      case 'retry':   return 'bg-signal-amber'
      case 'done':    return 'bg-signal-green'
      case 'queued':  return 'bg-ink-secondary'
      default:        return 'bg-ink-tertiary/40'
    }
  }
  function textColor(s: AgentStatus): string {
    switch (s) {
      case 'running': return 'text-ink-primary'
      case 'retry':   return 'text-signal-amber'
      case 'done':    return 'text-ink-primary'
      case 'queued':  return 'text-ink-secondary'
      default:        return 'text-ink-tertiary'
    }
  }
  function connectorActive(i: number): boolean {
    if (!running) return false
    return nodeStatuses[i] === 'running' || nodeStatuses[i + 1] === 'running'
  }

  return (
    <div className="rounded-4 border border-hairline bg-surface px-500 py-500 relative overflow-hidden">
      <div className="text-ink-tertiary uppercase tracking-[0.18em] text-[10px] font-mono mb-400">{label}</div>

      <div className="relative">
        {nodes.map((n, i) => {
          const s = nodeStatuses[i]
          const isLast = i === nodes.length - 1
          return (
            <div key={i} className="relative">
              <div className="flex items-start gap-300 py-200">
                <span className="relative shrink-0 flex flex-col items-center" style={{ width: 10, paddingTop: 6 }}>
                  <span
                    className={`block w-[8px] h-[8px] rounded-full ${dotColor(s)} ${s === 'running' ? 'animate-pulseDot' : ''}`}
                    style={{ boxShadow: s === 'running' ? '0 0 8px rgba(0,112,243,0.6)' : undefined }}
                  />
                  {!isLast && (
                    <span className="relative w-[1px] mt-100" style={{ height: 26 }}>
                      <span
                        className={`absolute inset-0 ${connectorActive(i) ? 'bg-gradient-to-b from-signal-blue to-signal-blue/20 animate-pulse' : 'bg-hairline-strong'}`}
                      />
                    </span>
                  )}
                </span>
                <span className={`font-mono text-100 leading-[1.5] ${textColor(s)}`}>{n.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
