// Douyu — public ranklist API for a category. No key.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

const DOUYU_CATE_ID: Record<string, number> = {
  'lol': 1, '英雄联盟': 1,
  '王者荣耀': 207, 'honor of kings': 207,
  'dota2': 56, 'dota': 56,
  '原神': 270, 'genshin': 270,
  'apex': 250, 'apex legends': 250,
  '绝地求生': 250, 'pubg': 250,
  '永劫无间': 304, 'naraka': 304,
  '和平精英': 211,
  '逆水寒': 7700,
  '英雄联盟手游': 1163, 'wild rift': 1163,
  '我的世界': 184, 'minecraft': 184,
  '使命召唤': 219, 'cod': 219,
  '梦幻西游': 71,
}

type RankResp = { data?: { rankList?: Array<{ nickname: string; hot: number; roomName: string; cate2Name?: string }> } }

export async function fetchDouyu(query: TrendQuery): Promise<TrendResult> {
  return wrap('douyu', query, async () => {
    const category = (query.category ?? '').toLowerCase().trim()
    const cateId = DOUYU_CATE_ID[category]
    if (!cateId) throw new Error(`unknown douyu category: ${category}`)

    const url = `https://www.douyu.com/japi/weblist/apinc/getRanklistByCateId?cateId=${cateId}`
    const r = await fetchJson<RankResp>(url)
    const list = r.data?.rankList ?? []
    if (list.length === 0) throw new Error('empty rank list')

    const top = list.slice(0, 10)
    const totalHot = list.reduce((s, x) => s + (x.hot ?? 0), 0)
    const datapoints: TrendDatapoint[] = top.map(r => ({ label: r.nickname, value: r.hot, meta: { room: r.roomName ?? '' } }))

    const summary = `斗鱼「${category}」热度榜 Top 10，第一名 ${list[0].nickname}（热度 ${fmtNum(list[0].hot)}）。`
    const digest = [
      `# 斗鱼直播 · ${category} (cateId ${cateId})`,
      '',
      `**榜单条目数**：${list.length} · **总热度**：${fmtNum(totalHot)}`,
      '',
      '## 热度前 10',
      ...top.map((r, i) => `${i + 1}. **${r.nickname}** · 热度 ${fmtNum(r.hot)} · ${(r.roomName ?? '').slice(0, 40)}`),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
