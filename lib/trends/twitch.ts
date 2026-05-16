// Twitch — Helix API with client_credentials OAuth. Requires TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET.
// Token cached in module memory; expires after ~60d so refresh logic kept minimal.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

type TokenResponse = { access_token: string; expires_in: number; token_type: string }
type TopGamesResponse = { data: Array<{ id: string; name: string; box_art_url: string }> }
type GameByNameResponse = { data: Array<{ id: string; name: string }> }
type StreamsResponse = { data: Array<{ user_name: string; viewer_count: number; title: string; started_at: string }> }

let tokenCache: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  const id = process.env.TWITCH_CLIENT_ID
  const secret = process.env.TWITCH_CLIENT_SECRET
  if (!id || !secret) throw new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set')
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`Twitch token HTTP ${res.status}`)
  const tk = (await res.json()) as TokenResponse
  tokenCache = { token: tk.access_token, expiresAt: Date.now() + (tk.expires_in - 60) * 1000 }
  return tk.access_token
}

export async function fetchTwitch(query: TrendQuery): Promise<TrendResult> {
  return wrap('twitch', query, async () => {
    const token = await getToken()
    const id = process.env.TWITCH_CLIENT_ID!
    const headers = { 'Client-Id': id, Authorization: `Bearer ${token}` }
    const titles = query.gameTitles ?? []

    if (titles.length === 0) {
      // Top games by current viewership (Helix returns by streams; we sum viewer_count below).
      const top = await fetchJson<TopGamesResponse>('https://api.twitch.tv/helix/games/top?first=10', { headers })
      const games = top.data ?? []
      if (games.length === 0) throw new Error('empty top list')

      const rows: Array<{ name: string; viewers: number; streams: number }> = []
      for (const g of games) {
        const streams = await fetchJson<StreamsResponse>(
          `https://api.twitch.tv/helix/streams?game_id=${g.id}&first=100`,
          { headers },
        )
        const totalViewers = (streams.data ?? []).reduce((s, x) => s + x.viewer_count, 0)
        rows.push({ name: g.name, viewers: totalViewers, streams: streams.data?.length ?? 0 })
      }
      rows.sort((a, b) => b.viewers - a.viewers)

      const datapoints: TrendDatapoint[] = rows.map(r => ({ label: r.name, value: r.viewers, meta: { streams: r.streams } }))
      const summary = `Twitch 当前观众数 Top 10，${rows[0].name} 领先（${fmtNum(rows[0].viewers)} 观众）。`
      const digest = [
        '# Twitch · 当前观众数 Top 10',
        '',
        ...rows.map((r, i) => `${i + 1}. **${r.name}** · ${fmtNum(r.viewers)} 观众 · ${fmtNum(r.streams)} 路直播`),
      ].join('\n')
      return { summary, digest, datapoints }
    }

    const rows: Array<{ name: string; viewers: number; streams: number }> = []
    for (const t of titles.slice(0, 5)) {
      try {
        const g = await fetchJson<GameByNameResponse>(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(t)}`, { headers })
        const gameId = g.data?.[0]?.id
        if (!gameId) continue
        const streams = await fetchJson<StreamsResponse>(`https://api.twitch.tv/helix/streams?game_id=${gameId}&first=100`, { headers })
        const totalViewers = (streams.data ?? []).reduce((s, x) => s + x.viewer_count, 0)
        rows.push({ name: g.data[0].name, viewers: totalViewers, streams: streams.data?.length ?? 0 })
      } catch { /* skip */ }
    }
    if (rows.length === 0) throw new Error('no games resolved')

    const datapoints: TrendDatapoint[] = rows.map(r => ({ label: r.name, value: r.viewers, meta: { streams: r.streams } }))
    const summary = `Twitch：${rows.map(r => `${r.name} ${fmtNum(r.viewers)} 观众`).join('；')}。`
    const digest = [
      '# Twitch · 指定游戏直播热度',
      '',
      ...rows.map(r => `- **${r.name}** · ${fmtNum(r.viewers)} 当前观众 · ${fmtNum(r.streams)} 路直播`),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
