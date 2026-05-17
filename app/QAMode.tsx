'use client'
// Q&A mode — single-agent ReAct loop with tool calling.
// Different paradigm from the strategy pipeline: here the agent decides what
// to search/query, and we visualize the reasoning + tool calls live.
//
// SSE events from /api/qa:
//   qa_start { question }
//   qa_token { delta }                            ← model reasoning tokens
//   qa_tool_call { id, name, args_delta }         ← model decided to call a tool
//   qa_tool_result { tool_call_id, name, content }← tool returned
//   qa_done / complete / error

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Loader, Search, TrendingUp, ChevronDown, CornerDownRight, RotateCw } from 'lucide-react'
import { marked } from 'marked'

type ToolCall = {
  id: string
  name: string
  argsRaw: string                  // streamed JSON fragments
  result?: string
  status: 'calling' | 'done' | 'failed'
}

type QAMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[]; done: boolean }


function ToolBubble({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false)
  const icon =
    tc.name === 'search_corpus' ? <Search className="w-3 h-3" strokeWidth={2} />
    : <TrendingUp className="w-3 h-3" strokeWidth={2} />
  const label = tc.name === 'search_corpus' ? '检索语料' : '查询趋势源'
  let parsedArgs: any = null
  try { parsedArgs = JSON.parse(tc.argsRaw || '{}') } catch {}
  return (
    <div className="my-300">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-300 px-300 py-200 rounded-2 border border-hairline bg-surface-soft hover:bg-surface-card transition-colors duration-150 ease-console text-left"
      >
        <span className="text-coral shrink-0">{icon}</span>
        <span className="text-100 font-mono text-ink-secondary">
          <span className="font-semibold text-ink-primary">{label}</span>
          {parsedArgs && (
            <span className="ml-300 text-ink-tertiary">
              {parsedArgs.query && <>· "{parsedArgs.query.slice(0, 40)}"</>}
              {parsedArgs.source && <>· {parsedArgs.source}</>}
              {parsedArgs.region && <>· {parsedArgs.region}</>}
              {parsedArgs.category && <>· {parsedArgs.category}</>}
            </span>
          )}
        </span>
        <span className="flex-1" />
        {tc.status === 'calling' ? (
          <Loader className="w-3 h-3 animate-spin text-coral" />
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-wider text-success">
            {tc.result ? `${Math.round(tc.result.length / 100) / 10}KB` : 'ok'}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 text-ink-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-700 mt-200 px-400 py-300 rounded-2 border border-hairline bg-surface-soft/60 max-h-[280px] overflow-y-auto">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-tertiary mb-200">request</div>
          <pre className="text-[12px] font-mono text-ink-secondary whitespace-pre-wrap break-all mb-300">{tc.argsRaw || '{}'}</pre>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-tertiary mb-200">response</div>
          <pre className="text-[12px] font-mono text-ink-secondary whitespace-pre-wrap leading-relaxed">{tc.result || '(pending)'}</pre>
        </div>
      )}
    </div>
  )
}


export default function QAMode({ lang }: { lang: 'zh' | 'en' }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const t = lang === 'zh' ? {
    title: '问答模式',
    desc: 'ReAct 智能体调用工具回答你的问题。看得到推理过程和每一次工具调用。',
    placeholder: '问一个具体的游戏产业问题。例如:王者荣耀和原神的商业化模式有什么本质差异？',
    send: '发送',
    abort: '中止',
    empty_hint: '试试问:',
    suggestions: [
      '王者荣耀和原神的商业化模式有什么本质差异?',
      'MOBA 品类在东南亚的窗口期还有多久?',
      '虎牙和斗鱼现在哪个直播平台游戏内容更活跃?',
    ],
    you: '你',
    agent: '研究员',
  } : {
    title: 'Q&A mode',
    desc: 'A ReAct agent that calls tools to answer your questions. You see the reasoning and every tool call.',
    placeholder: 'Ask a specific game-industry question. e.g. What\'s the monetization difference between Honor of Kings and Genshin Impact?',
    send: 'Send',
    abort: 'Abort',
    empty_hint: 'Try asking:',
    suggestions: [
      'What\'s the monetization difference between Honor of Kings and Genshin Impact?',
      'How much window is left for MOBA in Southeast Asia?',
      'Which Chinese livestream platform is most active for game content right now?',
    ],
    you: 'You',
    agent: 'Researcher',
  }

  // auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function abort() {
    abortRef.current?.abort()
    setRunning(false)
  }

  async function send(prompt?: string) {
    const q = (prompt ?? input).trim()
    if (!q || running) return
    setInput('')
    setRunning(true)

    // Append user msg + empty assistant placeholder
    setMessages(prev => [
      ...prev,
      { role: 'user', content: q },
      { role: 'assistant', content: '', toolCalls: [], done: false },
    ])

    const ctrl = new AbortController()
    abortRef.current = ctrl

    // History sent: keep prior messages (drop the placeholder we just added)
    const priorHistory = messages.flatMap(m => {
      if (m.role === 'user') return [{ role: 'user', content: m.content }]
      if (m.role === 'assistant' && m.done) return [{ role: 'assistant', content: m.content }]
      return []
    })

    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: priorHistory }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(await res.text() || `HTTP ${res.status}`)

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const block of parts) {
          const line = block.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            const ev = JSON.parse(payload)
            handleEvent(ev)
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages(prev => updateLast(prev, m => ({ ...m, content: m.content + `\n\n(失败: ${e?.message ?? 'unknown'})`, done: true })))
      }
    } finally {
      setRunning(false)
      setMessages(prev => updateLast(prev, m => ({ ...m, done: true })))
    }
  }

  function updateLast(msgs: QAMessage[], fn: (m: Extract<QAMessage, { role: 'assistant' }>) => Extract<QAMessage, { role: 'assistant' }>): QAMessage[] {
    const out = msgs.slice()
    for (let i = out.length - 1; i >= 0; i--) {
      const m = out[i]
      if (m.role === 'assistant') {
        out[i] = fn(m)
        break
      }
    }
    return out
  }

  function handleEvent(ev: any) {
    if (ev.type === 'qa_token' && ev.delta) {
      setMessages(prev => updateLast(prev, m => ({ ...m, content: m.content + ev.delta })))
    } else if (ev.type === 'qa_tool_call') {
      setMessages(prev => updateLast(prev, m => {
        const existing = m.toolCalls.find(tc => tc.id === ev.id)
        if (existing) {
          return { ...m, toolCalls: m.toolCalls.map(tc => tc.id === ev.id ? { ...tc, argsRaw: tc.argsRaw + (ev.args_delta || '') } : tc) }
        }
        return { ...m, toolCalls: [...m.toolCalls, { id: ev.id || crypto.randomUUID(), name: ev.name, argsRaw: ev.args_delta || '', status: 'calling' }] }
      }))
    } else if (ev.type === 'qa_tool_result') {
      setMessages(prev => updateLast(prev, m => ({
        ...m,
        toolCalls: m.toolCalls.map(tc => tc.id === ev.tool_call_id ? { ...tc, result: ev.content, status: 'done' } : tc),
      })))
    } else if (ev.type === 'qa_done') {
      setMessages(prev => updateLast(prev, m => ({ ...m, done: true })))
    } else if (ev.type === 'error') {
      setMessages(prev => updateLast(prev, m => ({ ...m, content: m.content + `\n\n(error: ${ev.message})`, done: true })))
    }
  }

  function reset() {
    if (running) abort()
    setMessages([])
  }

  return (
    <section className="mb-1200">
      <div className="flex items-baseline justify-between gap-400 mb-500">
        <div>
          <h2 className="font-serif text-display-sm text-ink-primary" style={{ fontWeight: 400, letterSpacing: '-0.01em' }}>{t.title}</h2>
          <p className="text-body-sm text-ink-tertiary mt-200">{t.desc}</p>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="inline-flex items-center gap-200 text-100 font-mono text-ink-tertiary hover:text-ink-primary">
            <RotateCw className="w-3 h-3" /> 清空
          </button>
        )}
      </div>

      <div ref={scrollRef} className="rounded-2 border border-hairline bg-canvas overflow-y-auto max-h-[640px]">
        {messages.length === 0 ? (
          <div className="px-700 py-1000 text-center">
            <p className="text-body-md text-ink-tertiary mb-500">{t.empty_hint}</p>
            <div className="flex flex-col items-center gap-300">
              {t.suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="inline-flex items-center gap-300 px-400 py-300 rounded-2 border border-hairline bg-surface-soft hover:border-coral/40 hover:text-coral text-body-sm text-ink-secondary transition-colors duration-150 ease-console text-left max-w-2xl"
                >
                  <CornerDownRight className="w-3 h-3 text-ink-tertiary shrink-0" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-600 py-600 space-y-700">
            {messages.map((m, i) => (
              <div key={i} className="animate-fadeIn">
                <div className="flex items-center gap-300 mb-300 text-[11px] font-mono uppercase tracking-[0.12em]">
                  {m.role === 'user' ? (
                    <span className="text-ink-tertiary">{t.you}</span>
                  ) : (
                    <>
                      <span className="text-coral font-semibold">{t.agent}</span>
                      {m.role === 'assistant' && !m.done && <Loader className="w-3 h-3 animate-spin text-coral" />}
                    </>
                  )}
                </div>
                {m.role === 'user' ? (
                  <div className="text-body-md text-ink-strong leading-relaxed">{m.content}</div>
                ) : (
                  <div>
                    {m.toolCalls.map(tc => <ToolBubble key={tc.id} tc={tc} />)}
                    {m.content && (
                      <div
                        className="prose-console mt-300"
                        dangerouslySetInnerHTML={{ __html: marked.parse(m.content, { breaks: true }) as string }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-500 flex items-center gap-300">
        <div className="flex-1 flex items-center gap-300 px-400 h-1100 rounded-2 border border-hairline bg-canvas focus-within:border-coral/50">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={t.placeholder}
            disabled={running}
            className="flex-1 bg-transparent outline-none text-body-md text-ink-primary placeholder:text-ink-tertiary"
          />
        </div>
        {running ? (
          <button
            onClick={abort}
            className="inline-flex items-center gap-200 px-500 h-1100 rounded-2 bg-surface-card border border-error/40 text-error text-200 font-medium hover:bg-error-soft transition-colors duration-150 ease-console"
          >
            {t.abort}
          </button>
        ) : (
          <button
            onClick={() => send()}
            disabled={!input.trim()}
            className="inline-flex items-center gap-200 px-500 h-1100 rounded-2 bg-coral text-on-coral text-200 font-medium hover:bg-coral-active transition-colors duration-150 ease-console disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t.send}
            <ArrowUp className="w-3 h-3" />
          </button>
        )}
      </div>
    </section>
  )
}
