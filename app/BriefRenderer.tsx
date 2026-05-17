'use client'
// Brief renderer that parses ```chart fenced blocks and renders inline SVG charts.
// The composer emits charts with: {"type": "bar"|"pie"|"line", "title", "data"}.
// No chart library on the wire — keeps the bundle small and the styling on-brand.

import { marked } from 'marked'
import { useMemo } from 'react'


type ChartSpec = {
  type: 'bar' | 'pie' | 'line'
  title?: string
  data: Array<{ label: string; value: number }>
  unit?: string
}

type Block =
  | { kind: 'md'; html: string }
  | { kind: 'chart'; spec: ChartSpec }


function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.split('\n')
  let buf: string[] = []
  let inChart = false
  let chartBuf: string[] = []

  const flushMd = () => {
    if (buf.length === 0) return
    const html = marked.parse(buf.join('\n'), { breaks: true }) as string
    blocks.push({ kind: 'md', html })
    buf = []
  }

  for (const line of lines) {
    if (!inChart && /^```chart\b/.test(line.trim())) {
      flushMd()
      inChart = true
      chartBuf = []
      continue
    }
    if (inChart) {
      if (line.trim() === '```') {
        try {
          const spec = JSON.parse(chartBuf.join('\n')) as ChartSpec
          if (spec && spec.type && Array.isArray(spec.data)) {
            blocks.push({ kind: 'chart', spec })
          }
        } catch { /* swallow; skip malformed */ }
        inChart = false
        chartBuf = []
        continue
      }
      chartBuf.push(line)
      continue
    }
    buf.push(line)
  }
  flushMd()
  return blocks
}


// Anthropic-palette chart fills (warm + ink, single coral accent for the lead bar)
const FILLS = ['#cc785c', '#5db8a6', '#e8a55a', '#5db872', '#a9583e', '#8e8b82']

function BarChart({ spec }: { spec: ChartSpec }) {
  const data = spec.data.slice(0, 12)
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1)
  const barH = 20
  const gap = 8
  const labelW = 140
  const chartW = 360
  const padX = 8
  const totalH = data.length * (barH + gap) + 16
  return (
    <figure className="my-500">
      {spec.title && <figcaption className="font-serif text-title-md text-ink-strong mb-300" style={{ fontWeight: 500 }}>{spec.title}</figcaption>}
      <svg
        viewBox={`0 0 ${labelW + chartW + padX * 2} ${totalH}`}
        className="w-full"
        style={{ maxWidth: 640 }}
      >
        {data.map((d, i) => {
          const y = i * (barH + gap) + 8
          const w = (Math.abs(d.value) / max) * chartW
          const fill = i === 0 ? FILLS[0] : '#d8d2c5'
          return (
            <g key={i}>
              <text
                x={labelW - 8}
                y={y + barH / 2 + 4}
                textAnchor="end"
                fontSize={12}
                fill="#3d3d3a"
                style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}
              >
                {d.label.length > 18 ? d.label.slice(0, 17) + '…' : d.label}
              </text>
              <rect x={labelW} y={y} width={w} height={barH} rx={2} fill={fill} />
              <text
                x={labelW + w + 6}
                y={y + barH / 2 + 4}
                fontSize={11}
                fill="#6c6a64"
                style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'JetBrains Mono, monospace' }}
              >
                {fmt(d.value)}{spec.unit ?? ''}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

function PieChart({ spec }: { spec: ChartSpec }) {
  const data = spec.data.slice(0, 8)
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0) || 1
  const cx = 110, cy = 110, r = 80
  let acc = 0
  return (
    <figure className="my-500">
      {spec.title && <figcaption className="font-serif text-title-md text-ink-strong mb-300" style={{ fontWeight: 500 }}>{spec.title}</figcaption>}
      <div className="flex flex-wrap items-center gap-700">
        <svg viewBox="0 0 220 220" width={220} height={220}>
          {data.map((d, i) => {
            const pct = Math.abs(d.value) / total
            const start = acc * Math.PI * 2 - Math.PI / 2
            acc += pct
            const end = acc * Math.PI * 2 - Math.PI / 2
            const x1 = cx + r * Math.cos(start)
            const y1 = cy + r * Math.sin(start)
            const x2 = cx + r * Math.cos(end)
            const y2 = cy + r * Math.sin(end)
            const large = pct > 0.5 ? 1 : 0
            const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
            return <path key={i} d={path} fill={FILLS[i % FILLS.length]} stroke="#faf9f5" strokeWidth={1.5} />
          })}
        </svg>
        <div className="flex flex-col gap-200">
          {data.map((d, i) => {
            const pct = ((Math.abs(d.value) / total) * 100).toFixed(1)
            return (
              <div key={i} className="flex items-center gap-300 text-body-sm">
                <span className="inline-block w-300 h-300 rounded-xs shrink-0" style={{ background: FILLS[i % FILLS.length] }} />
                <span className="text-ink-body">{d.label}</span>
                <span className="font-mono text-ink-tertiary tabular-nums">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </figure>
  )
}

function LineChart({ spec }: { spec: ChartSpec }) {
  const data = spec.data.slice(0, 32)
  const max = Math.max(...data.map(d => d.value), 1)
  const min = Math.min(...data.map(d => d.value), 0)
  const range = max - min || 1
  const w = 600, h = 200, pad = 28
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1)
  const points = data.map((d, i) => {
    const x = pad + i * stepX
    const y = h - pad - ((d.value - min) / range) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <figure className="my-500">
      {spec.title && <figcaption className="font-serif text-title-md text-ink-strong mb-300" style={{ fontWeight: 500 }}>{spec.title}</figcaption>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxWidth: 640 }}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e6dfd8" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e6dfd8" strokeWidth={1} />
        <polyline points={points} fill="none" stroke={FILLS[0]} strokeWidth={2} />
        {data.map((d, i) => {
          const x = pad + i * stepX
          const y = h - pad - ((d.value - min) / range) * (h - pad * 2)
          return <circle key={i} cx={x} cy={y} r={3} fill={FILLS[0]} />
        })}
        {data.map((d, i) => {
          if (i % Math.ceil(data.length / 6) !== 0 && i !== data.length - 1) return null
          const x = pad + i * stepX
          return (
            <text key={`l-${i}`} x={x} y={h - 8} textAnchor="middle" fontSize={10} fill="#6c6a64"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
            </text>
          )
        })}
      </svg>
    </figure>
  )
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}


export default function BriefRenderer({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseBlocks(markdown), [markdown])
  return (
    <div>
      {blocks.map((b, i) => {
        if (b.kind === 'md') {
          return (
            <div
              key={i}
              className="prose-console prose-brief font-sans text-body-md leading-[1.75]"
              dangerouslySetInnerHTML={{ __html: b.html }}
            />
          )
        }
        if (b.spec.type === 'bar')  return <BarChart  key={i} spec={b.spec} />
        if (b.spec.type === 'pie')  return <PieChart  key={i} spec={b.spec} />
        if (b.spec.type === 'line') return <LineChart key={i} spec={b.spec} />
        return null
      })}
    </div>
  )
}
