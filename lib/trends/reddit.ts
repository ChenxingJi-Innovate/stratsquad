// Reddit — public OAuth2 client_credentials. Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET + REDDIT_USER_AGENT.
// Returns post velocity and top posts for the given subreddits + keywords.

import { wrap, fetchJson, fmtNum } from './_helpers'
import type { TrendQuery, TrendResult, TrendDatapoint } from './types'

type TokenResponse = { access_token: string; expires_in: number }
type Listing = { data: { children: Array<{ data: { title: string; score: number; num_comments: number; subreddit: string; created_utc: number; permalink: string } }> } }

let tokenCache: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  const id = process.env.REDDIT_CLIENT_ID
  const secret = process.env.REDDIT_CLIENT_SECRET
  const ua = process.env.REDDIT_USER_AGENT ?? 'stratsquad/0.1'
  if (!id || !secret) throw new Error('REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set')
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'User-Agent': ua,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Reddit token HTTP ${res.status}`)
  const tk = (await res.json()) as TokenResponse
  tokenCache = { token: tk.access_token, expiresAt: Date.now() + (tk.expires_in - 60) * 1000 }
  return tk.access_token
}

export async function fetchReddit(query: TrendQuery): Promise<TrendResult> {
  return wrap('reddit', query, async () => {
    const subs = (query.subreddits ?? []).slice(0, 5)
    const keywords = (query.keywords ?? []).slice(0, 3)
    if (subs.length === 0 && keywords.length === 0) throw new Error('no subreddits or keywords')

    const token = await getToken()
    const ua = process.env.REDDIT_USER_AGENT ?? 'stratsquad/0.1'
    const headers = { Authorization: `Bearer ${token}`, 'User-Agent': ua }

    const allPosts: Array<{ title: string; score: number; num_comments: number; subreddit: string; created_utc: number; permalink: string }> = []
    const perSubAgg: Record<string, { posts: number; totalScore: number; totalComments: number }> = {}

    // For each subreddit + keyword combo, fetch top recent posts.
    const targets = subs.length > 0 ? subs : ['']
    for (const sub of targets) {
      const path = sub ? `/r/${sub}/search` : '/search'
      const q = keywords.length > 0 ? keywords.join(' OR ') : ''
      const url = `https://oauth.reddit.com${path}?q=${encodeURIComponent(q || sub)}&restrict_sr=${sub ? 1 : 0}&sort=top&t=month&limit=25`
      try {
        const l = await fetchJson<Listing>(url, { headers })
        const posts = (l.data?.children ?? []).map(c => c.data)
        for (const p of posts) {
          allPosts.push(p)
          const k = p.subreddit
          if (!perSubAgg[k]) perSubAgg[k] = { posts: 0, totalScore: 0, totalComments: 0 }
          perSubAgg[k].posts += 1
          perSubAgg[k].totalScore += p.score
          perSubAgg[k].totalComments += p.num_comments
        }
      } catch { /* skip */ }
    }
    if (allPosts.length === 0) throw new Error('no posts')

    const topPosts = [...allPosts].sort((a, b) => b.score - a.score).slice(0, 5)
    const datapoints: TrendDatapoint[] = Object.entries(perSubAgg).map(([sub, agg]) => ({
      label: `r/${sub}`,
      value: agg.totalScore,
      meta: { posts: agg.posts, comments: agg.totalComments },
    }))

    const summary = `Reddit 近 30 天 ${subs.join('/') || keywords.join('/')} 热度：共抓 ${allPosts.length} 帖，最高分 ${topPosts[0].score}。`
    const digest = [
      `# Reddit · 近 30 天 · ${subs.map(s => 'r/' + s).join(' · ') || keywords.join(' · ')}`,
      '',
      '## 子版聚合',
      ...Object.entries(perSubAgg).map(([sub, agg]) =>
        `- **r/${sub}** · ${agg.posts} 帖 · 总分 ${fmtNum(agg.totalScore)} · 总评论 ${fmtNum(agg.totalComments)}`,
      ),
      '',
      '## 热帖前 5',
      ...topPosts.map((p, i) => `${i + 1}. r/${p.subreddit} · ${p.score} 分 · ${p.num_comments} 评论 · ${p.title.slice(0, 80)}`),
    ].join('\n')
    return { summary, digest, datapoints }
  })
}
