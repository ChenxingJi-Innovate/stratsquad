// Steam — uses Steam Web API + storefront search. STEAM_API_KEY is optional;
// the GetNumberOfCurrentPlayers and storesearch endpoints work without it.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

type StoreSearchItem = { id: number; name: string }
type StoreSearchResponse = { items: StoreSearchItem[]; total: number }
type PlayerCountResponse = { response: { player_count?: number; result?: number } }
type TopGamesResponse = { response: { ranks: Array<{ rank: number; appid: number; concurrent_in_game: number; peak_in_game: number }> } }
type AppDetailsResponse = Record<string, { success: boolean; data?: { name: string } }>

export async function fetchSteam(query: TrendQuery): Promise<TrendResult> {
  return wrap('steam', query, async () => {
    const titles = query.gameTitles ?? []

    if (titles.length === 0) {
      // No specific titles → return Steam top games by current player count.
      const top = await fetchJson<TopGamesResponse>(
        'https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/',
      )
      const ranks = (top.response?.ranks ?? []).slice(0, 10)
      if (ranks.length === 0) throw new Error('empty rank list')

      // Resolve appids → names in one batch via appdetails (sequential to avoid rate limit).
      const names: Record<number, string> = {}
      for (const r of ranks.slice(0, 5)) {
        try {
          const ad = await fetchJson<AppDetailsResponse>(
            `https://store.steampowered.com/api/appdetails?appids=${r.appid}&filters=basic&cc=us`,
          )
          names[r.appid] = ad[String(r.appid)]?.data?.name ?? `appid ${r.appid}`
        } catch {
          names[r.appid] = `appid ${r.appid}`
        }
      }

      const datapoints: TrendDatapoint[] = ranks.map(r => ({
        label: names[r.appid] ?? `appid ${r.appid}`,
        value: r.concurrent_in_game,
        meta: { peak: r.peak_in_game, rank: r.rank },
      }))
      const summary = `Steam 当前在玩量 Top 10，第一名 ${names[ranks[0].appid] ?? 'unknown'} 当前 ${fmtNum(ranks[0].concurrent_in_game)} 人在玩。`
      const digest = [
        '# Steam · 当前在玩量 Top 10',
        '',
        ...ranks.map((r, i) => `${i + 1}. **${names[r.appid] ?? `appid ${r.appid}`}** · 当前 ${fmtNum(r.concurrent_in_game)} · 24h 峰值 ${fmtNum(r.peak_in_game)}`),
      ].join('\n')
      return { summary, digest, datapoints }
    }

    // Specific titles → resolve each to appid, fetch current player count.
    const results: Array<{ title: string; name: string; appid: number; players: number }> = []
    for (const t of titles.slice(0, 5)) {
      try {
        const search = await fetchJson<StoreSearchResponse>(
          `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(t)}&cc=us`,
        )
        const top = search.items?.[0]
        if (!top) continue
        const pc = await fetchJson<PlayerCountResponse>(
          `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${top.id}`,
        )
        const players = pc.response?.player_count ?? 0
        results.push({ title: t, name: top.name, appid: top.id, players })
      } catch {
        // skip this title; one failure doesn't sink the rest
      }
    }
    if (results.length === 0) throw new Error('no titles resolved')

    const datapoints: TrendDatapoint[] = results.map(r => ({ label: r.name, value: r.players, meta: { appid: r.appid } }))
    const summary = `Steam 当前在玩量：${results.map(r => `${r.name} ${fmtNum(r.players)}`).join('；')}。`
    const digest = [
      '# Steam · 指定游戏在玩量',
      '',
      ...results.map(r => `- **${r.name}** (appid ${r.appid}) · 当前在玩 ${fmtNum(r.players)} 人`),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
