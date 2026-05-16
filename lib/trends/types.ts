// Shape of a single trend datapoint coming back from any source.
// All sources normalize their result into this so the agent and UI don't care which one it came from.

export type TrendSource =
  | 'google-trends'
  | 'steam'
  | 'twitch'
  | 'reddit'
  | 'youtube'
  | 'appstore'
  | 'huya'
  | 'douyu'
  | 'bilibili'

export const TREND_SOURCE_LABEL_ZH: Record<TrendSource, string> = {
  'google-trends': 'Google 趋势',
  'steam': 'Steam 在玩量',
  'twitch': 'Twitch 直播',
  'reddit': 'Reddit 社区',
  'youtube': 'YouTube',
  'appstore': 'App Store 榜单',
  'huya': '虎牙直播',
  'douyu': '斗鱼直播',
  'bilibili': '哔哩哔哩',
}

export const TREND_SOURCE_LABEL_EN: Record<TrendSource, string> = {
  'google-trends': 'Google Trends',
  'steam': 'Steam Charts',
  'twitch': 'Twitch',
  'reddit': 'Reddit',
  'youtube': 'YouTube',
  'appstore': 'App Store',
  'huya': 'Huya',
  'douyu': 'Douyu',
  'bilibili': 'Bilibili',
}

// What the planner decided to ask each source for.
export type TrendQuery = {
  source: TrendSource
  // Free-form query parameters; each source interprets these its own way.
  keywords?: string[]
  region?: string             // ISO-3166 alpha-2 or 'WW' / 'SEA' / 'CN' etc.
  gameTitles?: string[]       // for Steam / Twitch / App Store
  subreddits?: string[]       // for Reddit
  category?: string           // for Huya / Douyu / Bilibili (game category name)
  timeframe?: string          // 'now 7-d', 'today 12-m', etc. (Google Trends syntax)
}

// What a source returns. Either ok with a markdown digest + raw numeric points,
// or not ok with a reason. Either way the UI shows it as a card.
export type TrendResult =
  | {
      ok: true
      source: TrendSource
      label: string                        // human label for UI (zh)
      query: TrendQuery                    // what was asked
      summary: string                      // 1-3 sentences, plain text
      digest: string                       // structured markdown, fed to the trend agent
      datapoints?: TrendDatapoint[]        // optional raw points for charting
      fetchedAt: number
      latencyMs: number
    }
  | {
      ok: false
      source: TrendSource
      label: string
      query: TrendQuery
      error: string
      fetchedAt: number
      latencyMs: number
    }

export type TrendDatapoint = {
  label: string                  // x-axis label (date, region, game title)
  value: number                  // y-axis value
  meta?: Record<string, string | number>
}

// The full plan that the planner emits. UI shows this as the "DATA QUERY" head.
export type TrendQueryPlan = {
  rationale: string              // one paragraph why these sources were picked
  queries: TrendQuery[]
}

// The bundle handed to the trend agent.
export type TrendDataBundle = {
  plan: TrendQueryPlan
  results: TrendResult[]
}
