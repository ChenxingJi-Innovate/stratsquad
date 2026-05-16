// Trend query planner. Uses DeepSeek in JSON mode to pick 4-7 trend sources for the trend brief.
// Output is consumed by dispatch.ts which fires the queries in parallel.

import { runJSON } from '../agents/_run'
import type { EventSink } from '../stream'
import type { TrendQueryPlan, TrendQuery, TrendSource } from './types'

const KNOWN_HUYA_CATEGORIES = [
  'lol', '英雄联盟', '王者荣耀', 'dota2', '永劫无间', '原神', 'apex', '绝地求生', '和平精英',
  '英雄联盟手游', '逆水寒', '使命召唤', '我的世界', '梦幻西游', '战地',
]
const KNOWN_DOUYU_CATEGORIES = [
  'lol', '英雄联盟', '王者荣耀', 'dota2', '原神', 'apex', '绝地求生', '永劫无间',
  '和平精英', '逆水寒', '英雄联盟手游', '我的世界', '使命召唤', '梦幻西游',
]
const KNOWN_BILIBILI_CATEGORIES = [
  'lol', '英雄联盟', '原神', '王者荣耀', 'apex', '永劫无间', '使命召唤手游',
  '和平精英', '蛋仔派对', 'minecraft', '我的世界',
]

const ALL_SOURCES: TrendSource[] = ['google-trends', 'steam', 'twitch', 'reddit', 'youtube', 'appstore', 'huya', 'douyu', 'bilibili']

const SOURCE_DESCRIPTIONS: Record<TrendSource, string> = {
  'google-trends': `1. google-trends - 全球关键词搜索热度，可选 region (US/JP/KR/ID/VN/PH/TH/MY/SG/TW/HK/GB/FR/DE/CN/WW)、timeframe (默认 "today 12-m")。返回相对值 0-100。`,
  'steam': `2. steam - PC 游戏当前在玩量。可传 gameTitles 查指定游戏，或不传查 Top 10。`,
  'twitch': `3. twitch - 海外直播品类热度。需要 gameTitles 或不传查 Top 10。Twitch 在中国大陆无用，不要为中国市场问题选这个。`,
  'reddit': `4. reddit - 海外社区情绪。需要 subreddits (如 ["MobileGaming","gachagaming","GenshinImpact"]) 和/或 keywords。`,
  'youtube': `5. youtube - 视频热度。需要 keywords，可选 region (默认 US)。`,
  'appstore': `6. appstore - iOS App Store 游戏榜。需要 region (国家二字代码如 us/cn/jp/kr/id/vn/ph/sg/th)。`,
  'huya': `7. huya - 中国虎牙直播。需要 category (取值之一: ${KNOWN_HUYA_CATEGORIES.join(', ')})。海外问题不要选。`,
  'douyu': `8. douyu - 中国斗鱼直播。需要 category (取值之一: ${KNOWN_DOUYU_CATEGORIES.join(', ')})。海外问题不要选。`,
  'bilibili': `9. bilibili - 哔哩哔哩。两种用法之一: 传 category (取值之一: ${KNOWN_BILIBILI_CATEGORIES.join(', ')}) 查直播; 或传 keywords 查视频。`,
}

export async function runTrendPlanner(
  trendBrief: string,
  question: string,
  sink: EventSink,
  enabledSources?: TrendSource[],
): Promise<TrendQueryPlan> {
  const allowedSet = new Set<TrendSource>(enabledSources && enabledSources.length > 0 ? enabledSources : ALL_SOURCES)
  const allowedList = ALL_SOURCES.filter(s => allowedSet.has(s))
  if (allowedList.length === 0) {
    const empty: TrendQueryPlan = { rationale: '用户禁用了全部数据源。', queries: [] }
    sink.emit({ type: 'trend_plan', plan: empty })
    return empty
  }

  const sourceListBlock = allowedList.map(s => SOURCE_DESCRIPTIONS[s]).join('\n')
  const constraintLine = enabledSources && enabledSources.length > 0 && enabledSources.length < ALL_SOURCES.length
    ? `\n注意：用户限定本次只能使用以下 ${allowedList.length} 个源: ${allowedList.join(', ')}。不要选其他源。`
    : ''

  const systemPrompt = `你是数据采集规划器。给定一个游戏行业战略问题与对应的"行业趋势"子简报，你要决定从哪些公开数据源采集证据。

可用数据源:

${sourceListBlock}
${constraintLine}

规则:
- 在用户允许的源里选 4-7 个 (如果允许源 < 4 就全选)。把"区域适配"放在第一位。
- 中国相关问题: 必选 huya / douyu / bilibili (如果游戏在 known list 里), 至少一个 appstore region=cn, 配合 google-trends region=CN 验证关键词热度。
- 东南亚/海外问题: 必选 google-trends 对应区域 + twitch + reddit + youtube + appstore 对应国家。huya/douyu/bilibili 不选。
- 跨区域问题: 国内外都选，但每个区域至少 2 个源。
- 关键词用中英对照。给中国市场的关键词用中文，给海外的用英文。
- gameTitles 用游戏的英文常用名 (Mobile Legends, Honor of Kings, Genshin Impact 等)。
- huya/douyu/bilibili 的 category 必须严格在上面列表里，否则跳过这个源。

输出 JSON 格式:
{
  "rationale": "一段话说明你为什么选这些源 (中文, 50-150 字)",
  "queries": [
    { "source": "google-trends", "keywords": ["MOBA mobile", "Honor of Kings"], "region": "ID", "timeframe": "today 12-m" },
    { "source": "twitch", "gameTitles": ["Mobile Legends: Bang Bang"] },
    ...
  ]
}

只输出 JSON，不要任何其他文字。`

  const userPrompt = `战略问题: "${question}"\n\n趋势子简报: """${trendBrief}"""\n\n请输出查询计划。`

  const plan = await runJSON<TrendQueryPlan>({
    agent: 'trend',  // emitted under trend agent's stream channel; UI knows it's the planner via type tag
    prompt: userPrompt,
    system: systemPrompt,
    sse: { emit: () => { /* swallow agent_start/done events from planner so UI shows trend agent only once */ } },
    maxTokens: 1200,
  })

  // Defensive validation: drop unknown sources / invalid categories so dispatch doesn't choke.
  // Also drop anything that ended up outside the user's enabledSources allowlist.
  const cleanQueries: TrendQuery[] = (plan.queries ?? []).filter(q => {
    if (!q?.source) return false
    if (!allowedSet.has(q.source)) return false
    if (q.source === 'huya' && !q.category) return false
    if (q.source === 'huya' && !KNOWN_HUYA_CATEGORIES.includes((q.category ?? '').toLowerCase())) return false
    if (q.source === 'douyu' && !KNOWN_DOUYU_CATEGORIES.includes((q.category ?? '').toLowerCase())) return false
    if (q.source === 'bilibili' && q.category && !KNOWN_BILIBILI_CATEGORIES.includes(q.category.toLowerCase())) {
      // If bilibili category is unknown, keep the query but as a keyword-only search.
      delete q.category
    }
    return true
  })

  const finalPlan: TrendQueryPlan = {
    rationale: plan.rationale ?? '采集计划由趋势规划器自动生成。',
    queries: cleanQueries,
  }
  sink.emit({ type: 'trend_plan', plan: finalPlan })
  return finalPlan
}
