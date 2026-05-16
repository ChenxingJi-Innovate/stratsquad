// Google Trends — no official API. Uses the public /trends/api/explore + widgetdata flow.
// Returns relative interest-over-time for one or more keywords + region.
// Failure modes: 429 rate-limit (most common), 200 with empty timelineData (silent), token expiry.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

type ExploreWidget = { id: string; token: string; request: any }
type ExploreResponse = { widgets: ExploreWidget[] }
type TimelinePoint = { time: string; formattedTime?: string; formattedAxisTime?: string; value: number[]; formattedValue?: string[] }
type TimelineResponse = { default: { timelineData: TimelinePoint[] } }

export async function fetchGoogleTrends(query: TrendQuery): Promise<TrendResult> {
  return wrap('google-trends', query, async () => {
    const keywords = (query.keywords ?? []).slice(0, 5)
    if (keywords.length === 0) throw new Error('no keywords')
    const geo = (query.region ?? '').toUpperCase()
    const time = query.timeframe ?? 'today 12-m'

    const exploreReq = {
      comparisonItem: keywords.map(k => ({ keyword: k, geo: geo === 'WW' ? '' : geo, time })),
      category: 0,
      property: '',
    }
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(exploreReq))}`
    const explore = await fetchJson<ExploreResponse>(exploreUrl)
    const timelineWidget = explore.widgets.find(w => w.id === 'TIMESERIES')
    if (!timelineWidget) throw new Error('no TIMESERIES widget')

    const wReq = { ...timelineWidget.request, requestOptions: { ...timelineWidget.request?.requestOptions, ...timelineWidget.request?.requestOptions } }
    const timelineUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(
      JSON.stringify(timelineWidget.request),
    )}&token=${encodeURIComponent(timelineWidget.token)}`
    const timeline = await fetchJson<TimelineResponse>(timelineUrl)
    const points = timeline.default?.timelineData ?? []
    if (points.length === 0) throw new Error('empty timeline')

    // Average per keyword across the window.
    const avgs = keywords.map((_, idx) => {
      const vals = points.map(p => p.value?.[idx] ?? 0).filter(v => !isNaN(v))
      return vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length)
    })
    const peakIdx = points.reduce((maxIdx, p, i, arr) => {
      const m = Math.max(...(p.value ?? []))
      const mc = Math.max(...(arr[maxIdx].value ?? []))
      return m > mc ? i : maxIdx
    }, 0)
    const peak = points[peakIdx]

    const datapoints: TrendDatapoint[] = points.map((p, i) => ({
      label: p.formattedTime ?? p.time ?? String(i),
      value: Math.max(...(p.value ?? [0])),
      meta: keywords.reduce((m, k, idx) => ({ ...m, [k]: p.value?.[idx] ?? 0 }), {}),
    }))

    const region = geo || 'WW'
    const summary = `关键词 ${keywords.join(' / ')} 在 ${region} 区域，${time} 时段平均热度 ${avgs.map(a => a.toFixed(0)).join(' / ')}（0-100 相对值）。`
    const lines = [
      `# Google Trends · ${keywords.join(' / ')} · ${region} · ${time}`,
      '',
      keywords.map((k, i) => `- **${k}** 平均热度 ${avgs[i].toFixed(1)}/100`).join('\n'),
      '',
      `**全期峰值**：${peak.formattedTime ?? peak.time}（最高值 ${Math.max(...(peak.value ?? [0]))}）`,
      '',
      `数据点 ${points.length} 个；首点 ${points[0]?.formattedTime ?? points[0]?.time}，尾点 ${points[points.length - 1]?.formattedTime ?? points[points.length - 1]?.time}。`,
    ]
    return { summary, digest: lines.join('\n'), datapoints }
  })
}
