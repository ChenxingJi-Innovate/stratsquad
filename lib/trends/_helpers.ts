// Shared utilities for trend source modules.
// All sources call wrap() to get consistent timing + error wrapping; fetchJson() applies a 10s timeout.

import type { TrendResult, TrendQuery, TrendSource } from './types'
import { TREND_SOURCE_LABEL_ZH } from './types'

export async function wrap(
  source: TrendSource,
  query: TrendQuery,
  body: () => Promise<{ summary: string; digest: string; datapoints?: TrendResult extends { ok: true } ? any : any[] }>,
): Promise<TrendResult> {
  const startedAt = Date.now()
  const label = TREND_SOURCE_LABEL_ZH[source]
  try {
    const { summary, digest, datapoints } = await body()
    return {
      ok: true, source, label, query, summary, digest,
      datapoints: datapoints as any,
      fetchedAt: Date.now(), latencyMs: Date.now() - startedAt,
    }
  } catch (e: any) {
    return {
      ok: false, source, label, query,
      error: e?.message ?? 'unknown error',
      fetchedAt: Date.now(), latencyMs: Date.now() - startedAt,
    }
  }
}

export async function fetchJson<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 10000, ...rest } = init
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        ...rest.headers,
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const txt = await res.text()
    // Some endpoints (Google) prefix JSON with )]}' protection.
    const cleaned = txt.replace(/^\)\]\}'?\s*/, '')
    return JSON.parse(cleaned) as T
  } finally {
    clearTimeout(t)
  }
}

export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<string> {
  const { timeoutMs = 10000, ...rest } = init
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        ...rest.headers,
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

export function compact(s: string, n = 200): string {
  if (s.length <= n) return s
  return s.slice(0, n) + '…'
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
