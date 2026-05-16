// App Store — Apple's official iTunes RSS feeds. No key. Genre 6014 = Games.
// Country codes: us cn jp kr id vn ph sg th my tw hk gb fr de etc.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

type RssEntry = {
  'im:name': { label: string }
  'im:artist': { label: string }
  category?: { attributes?: { label?: string } }
  id?: { label?: string }
  'im:price'?: { label: string; attributes?: { amount?: string; currency?: string } }
}
type RssResp = { feed: { entry: RssEntry[] } }

const COUNTRY_LABEL: Record<string, string> = {
  us: '美国', cn: '中国', jp: '日本', kr: '韩国', id: '印尼', vn: '越南', ph: '菲律宾',
  sg: '新加坡', th: '泰国', my: '马来西亚', tw: '台湾', hk: '香港', gb: '英国', fr: '法国', de: '德国',
}

export async function fetchAppStore(query: TrendQuery): Promise<TrendResult> {
  return wrap('appstore', query, async () => {
    const region = (query.region ?? 'us').toLowerCase()
    const country = region.length === 2 ? region : 'us'
    const kinds: Array<{ slug: 'topfreeapplications' | 'topgrossingapplications' | 'toppaidapplications'; zh: string }> = [
      { slug: 'topfreeapplications', zh: '免费榜' },
      { slug: 'topgrossingapplications', zh: '畅销榜' },
    ]
    const all: Array<{ kind: string; rank: number; name: string; artist: string }> = []
    for (const k of kinds) {
      try {
        const url = `https://itunes.apple.com/${country}/rss/${k.slug}/limit=25/genre=6014/json`
        const r = await fetchJson<RssResp>(url)
        const entries = r.feed?.entry ?? []
        entries.slice(0, 15).forEach((e, idx) => {
          all.push({ kind: k.zh, rank: idx + 1, name: e['im:name'].label, artist: e['im:artist'].label })
        })
      } catch { /* skip this kind */ }
    }
    if (all.length === 0) throw new Error('no entries')

    const free = all.filter(x => x.kind === '免费榜')
    const grossing = all.filter(x => x.kind === '畅销榜')

    const datapoints: TrendDatapoint[] = grossing.slice(0, 10).map(x => ({
      label: x.name.slice(0, 30),
      value: 16 - x.rank,
      meta: { artist: x.artist, rank: x.rank },
    }))

    const summary = `App Store ${COUNTRY_LABEL[country] ?? country.toUpperCase()} · 游戏类畅销榜第一：${grossing[0]?.name ?? '—'}（${grossing[0]?.artist ?? '—'}）。`
    const digest = [
      `# App Store · ${COUNTRY_LABEL[country] ?? country.toUpperCase()} (${country.toUpperCase()}) · 游戏类`,
      '',
      '## 畅销榜 Top 15',
      ...grossing.slice(0, 15).map(x => `${x.rank}. **${x.name}** · ${x.artist}`),
      '',
      '## 免费榜 Top 15',
      ...free.slice(0, 15).map(x => `${x.rank}. **${x.name}** · ${x.artist}`),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
