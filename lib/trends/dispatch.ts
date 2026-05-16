// Dispatch trend queries in parallel. Each result is streamed to the UI as soon as it lands.

import type { EventSink } from '../stream'
import type { TrendQuery, TrendResult, TrendQueryPlan, TrendDataBundle } from './types'
import { fetchGoogleTrends } from './google-trends'
import { fetchSteam } from './steam'
import { fetchTwitch } from './twitch'
import { fetchReddit } from './reddit'
import { fetchYoutube } from './youtube'
import { fetchAppStore } from './appstore'
import { fetchHuya } from './huya'
import { fetchDouyu } from './douyu'
import { fetchBilibili } from './bilibili'

async function runOne(q: TrendQuery): Promise<TrendResult> {
  switch (q.source) {
    case 'google-trends': return fetchGoogleTrends(q)
    case 'steam': return fetchSteam(q)
    case 'twitch': return fetchTwitch(q)
    case 'reddit': return fetchReddit(q)
    case 'youtube': return fetchYoutube(q)
    case 'appstore': return fetchAppStore(q)
    case 'huya': return fetchHuya(q)
    case 'douyu': return fetchDouyu(q)
    case 'bilibili': return fetchBilibili(q)
    default:
      // Unknown source: synthesize a not-ok TrendResult so the UI still renders something.
      return {
        ok: false, source: q.source, label: q.source, query: q,
        error: 'unknown source', fetchedAt: Date.now(), latencyMs: 0,
      }
  }
}

export async function dispatchTrendQueries(
  plan: TrendQueryPlan,
  sink: EventSink,
): Promise<TrendDataBundle> {
  const results: TrendResult[] = await Promise.all(
    plan.queries.map(async q => {
      const r = await runOne(q)
      sink.emit({ type: 'trend_result', result: r })
      return r
    }),
  )
  const bundle: TrendDataBundle = { plan, results }
  sink.emit({ type: 'trend_bundle', bundle })
  return bundle
}
