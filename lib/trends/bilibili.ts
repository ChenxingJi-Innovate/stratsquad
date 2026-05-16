// Bilibili — public web API. No key. Two endpoints:
// 1. Live category list (api.live.bilibili.com) if a known game category is asked
// 2. Popular video search by keyword (api.bilibili.com/x/web-interface/search) — generic fallback

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

// Live category area_id (child) + parent_area_id (parent = 2 for games).
const BILIBILI_LIVE_AREA: Record<string, { area: number; parent: number }> = {
  'lol': { area: 86, parent: 2 }, '英雄联盟': { area: 86, parent: 2 },
  '原神': { area: 240, parent: 2 }, 'genshin': { area: 240, parent: 2 },
  '王者荣耀': { area: 87, parent: 2 }, 'honor of kings': { area: 87, parent: 2 },
  'apex': { area: 235, parent: 2 }, 'apex legends': { area: 235, parent: 2 },
  '永劫无间': { area: 638, parent: 2 }, 'naraka': { area: 638, parent: 2 },
  '使命召唤手游': { area: 326, parent: 2 },
  '和平精英': { area: 388, parent: 2 },
  '蛋仔派对': { area: 681, parent: 2 },
  'minecraft': { area: 145, parent: 2 }, '我的世界': { area: 145, parent: 2 },
}

type LiveRoomListResp = { data?: { list?: Array<{ uname: string; title: string; online: number; area_name?: string }> } }
type SearchResp = {
  data?: {
    result?: Array<{
      result_type?: string
      data?: Array<{ title: string; play?: number; video_review?: number; author?: string; bvid?: string }>
    }>
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

export async function fetchBilibili(query: TrendQuery): Promise<TrendResult> {
  return wrap('bilibili', query, async () => {
    const category = (query.category ?? '').toLowerCase().trim()
    const keywords = (query.keywords ?? []).slice(0, 1)

    // Path 1: known live category → aggregate live room online counts.
    if (category && BILIBILI_LIVE_AREA[category]) {
      const { area, parent } = BILIBILI_LIVE_AREA[category]
      const url = `https://api.live.bilibili.com/room/v3/area/getRoomList?area_id=${area}&parent_area_id=${parent}&page=1&page_size=20&platform=web`
      const r = await fetchJson<LiveRoomListResp>(url)
      const rooms = r.data?.list ?? []
      if (rooms.length === 0) throw new Error('empty room list')

      const top = rooms.slice(0, 10)
      const totalOnline = rooms.reduce((s, x) => s + (x.online ?? 0), 0)
      const datapoints: TrendDatapoint[] = top.map(r => ({ label: r.uname, value: r.online, meta: { title: r.title } }))

      const summary = `B站直播「${category}」当前 ${rooms.length} 路直播，总在线热度 ${fmtNum(totalOnline)}。`
      const digest = [
        `# 哔哩哔哩直播 · ${category} (area ${area})`,
        '',
        `**当前直播间**：${rooms.length} 路 · **总在线热度**：${fmtNum(totalOnline)}`,
        '',
        '## 热度前 10',
        ...top.map((r, i) => `${i + 1}. **${r.uname}** · 在线 ${fmtNum(r.online)} · ${(r.title ?? '').slice(0, 40)}`),
      ].join('\n')
      return { summary, digest, datapoints }
    }

    // Path 2: keyword search → top videos by play count.
    if (keywords.length === 0) throw new Error('no category and no keyword')
    const q = keywords[0]
    const url = `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(q)}`
    const r = await fetchJson<SearchResp>(url, {
      headers: { Referer: 'https://www.bilibili.com/' },
    })
    const videoBlock = (r.data?.result ?? []).find(b => b.result_type === 'video')
    const videos = (videoBlock?.data ?? []).slice(0, 10)
    if (videos.length === 0) throw new Error('no videos')

    const totalPlay = videos.reduce((s, v) => s + (v.play ?? 0), 0)
    const datapoints: TrendDatapoint[] = videos.map(v => ({
      label: stripHtml(v.title).slice(0, 30),
      value: v.play ?? 0,
      meta: { author: v.author ?? '', bvid: v.bvid ?? '' },
    }))

    const summary = `B站搜索「${q}」前 10 视频总播放 ${fmtNum(totalPlay)}，第一名 ${fmtNum(videos[0].play ?? 0)} 播放。`
    const digest = [
      `# 哔哩哔哩 · 视频搜索「${q}」`,
      '',
      `**Top 10 总播放**：${fmtNum(totalPlay)}`,
      '',
      ...videos.slice(0, 5).map((v, i) =>
        `${i + 1}. ${stripHtml(v.title).slice(0, 70)} · @${v.author} · ${fmtNum(v.play ?? 0)} 播放`,
      ),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
