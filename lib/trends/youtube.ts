// YouTube Data API v3. Requires YOUTUBE_API_KEY.
// Strategy: keyword search filtered to videoCategoryId=20 (Gaming), order by viewCount,
// then fetch video stats. Returns top videos + aggregate view count.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

type SearchResp = { items: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string; publishedAt: string } }> }
type StatsResp = { items: Array<{ id: string; statistics: { viewCount?: string; likeCount?: string; commentCount?: string }; snippet: { title: string; channelTitle: string; publishedAt: string } }> }

export async function fetchYoutube(query: TrendQuery): Promise<TrendResult> {
  return wrap('youtube', query, async () => {
    const key = process.env.YOUTUBE_API_KEY
    if (!key) throw new Error('YOUTUBE_API_KEY not set')
    const keywords = (query.keywords ?? []).slice(0, 3)
    if (keywords.length === 0) throw new Error('no keywords')

    const q = keywords.join(' ')
    const regionCode = (query.region ?? 'US').toUpperCase()
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=20&order=viewCount&maxResults=10&regionCode=${regionCode}&key=${key}`
    const search = await fetchJson<SearchResp>(searchUrl)
    const ids = (search.items ?? []).map(i => i.id.videoId).filter(Boolean)
    if (ids.length === 0) throw new Error('no videos')

    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids.join(',')}&key=${key}`
    const stats = await fetchJson<StatsResp>(statsUrl)
    const rows = (stats.items ?? []).map(v => ({
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      views: Number(v.statistics.viewCount ?? 0),
      likes: Number(v.statistics.likeCount ?? 0),
      published: v.snippet.publishedAt,
    }))
    rows.sort((a, b) => b.views - a.views)

    const totalViews = rows.reduce((s, r) => s + r.views, 0)
    const datapoints: TrendDatapoint[] = rows.slice(0, 10).map(r => ({
      label: r.title.slice(0, 40),
      value: r.views,
      meta: { channel: r.channel, likes: r.likes },
    }))
    const summary = `YouTube ${keywords.join(' / ')} 区域 ${regionCode}，Top 10 视频总播放 ${fmtNum(totalViews)}，第一名 ${fmtNum(rows[0].views)}。`
    const digest = [
      `# YouTube · ${keywords.join(' / ')} · ${regionCode}`,
      '',
      `**Top 10 视频总播放**：${fmtNum(totalViews)}`,
      '',
      ...rows.slice(0, 5).map((r, i) =>
        `${i + 1}. ${r.title.slice(0, 70)} (${r.channel}) · ${fmtNum(r.views)} 播放 · ${fmtNum(r.likes)} 赞`,
      ),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
