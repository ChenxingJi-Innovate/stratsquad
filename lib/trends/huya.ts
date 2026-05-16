// Huya — public live category list. No key. Game IDs from Huya's URL scheme (huya.com/g/{id}).
// Falls back to overall top-game list if no category match.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

const HUYA_CATEGORY_ID: Record<string, number> = {
  'lol': 1, '英雄联盟': 1,
  '王者荣耀': 2336, 'honor of kings': 2336,
  'dota2': 5, 'dota': 5,
  '永劫无间': 6090, 'naraka': 6090,
  '原神': 3203, 'genshin': 3203,
  'apex': 5973, 'apex legends': 5973,
  '绝地求生': 2356, 'pubg': 2356,
  '和平精英': 4438,
  '英雄联盟手游': 6010, 'wild rift': 6010,
  'fps': 0, 'moba': 0,
  '逆水寒': 6620,
  '永劫': 6090,
  '战地': 5887,
  '使命召唤': 5879, 'cod': 5879,
  '我的世界': 660, 'minecraft': 660,
  '梦幻西游': 1366,
}

type LiveListResp = { data?: { datas?: Array<{ nick: string; totalCount: number; gameFullName?: string; introduction?: string }> } }

export async function fetchHuya(query: TrendQuery): Promise<TrendResult> {
  return wrap('huya', query, async () => {
    const category = (query.category ?? '').toLowerCase().trim()
    const gameId = HUYA_CATEGORY_ID[category]
    if (!gameId) throw new Error(`unknown huya category: ${category}`)

    const url = `https://live.huya.com/liveHttpUI/getLiveList?gameId=${gameId}&tagAll=0&page=1`
    const r = await fetchJson<LiveListResp>(url)
    const rooms = r.data?.datas ?? []
    if (rooms.length === 0) throw new Error('empty room list')

    const top = rooms.slice(0, 10)
    const totalViewers = rooms.reduce((s, x) => s + (x.totalCount ?? 0), 0)
    const datapoints: TrendDatapoint[] = top.map(r => ({ label: r.nick, value: r.totalCount, meta: { intro: r.introduction ?? '' } }))

    const summary = `虎牙「${category}」当前 ${rooms.length} 路直播，总热度 ${fmtNum(totalViewers)}（峰值非真人观众数，是虎牙的热度值）。`
    const digest = [
      `# 虎牙直播 · ${category} (gameId ${gameId})`,
      '',
      `**当前直播间**：${rooms.length} 路 · **总热度**：${fmtNum(totalViewers)}`,
      '',
      '## 热度前 10',
      ...top.map((r, i) => `${i + 1}. **${r.nick}** · 热度 ${fmtNum(r.totalCount)} · ${(r.introduction ?? '').slice(0, 40)}`),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
