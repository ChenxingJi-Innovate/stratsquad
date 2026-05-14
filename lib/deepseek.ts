import OpenAI from 'openai'

// DeepSeek serves an OpenAI-compatible API. We point the OpenAI SDK at api.deepseek.com.
// Override DEEPSEEK_MODEL in env to switch between deepseek-v4 / deepseek-v4-flash / deepseek-reasoner.
export const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'

// OpenAI SDK's constructor throws if apiKey is empty, which kills `next build`
// during page-data collection on machines without the env var. We pass a placeholder
// so build always succeeds; the route handler in app/api/run/route.ts checks
// process.env.DEEPSEEK_API_KEY at request time and returns 500 if missing.
export const ds = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'placeholder-set-DEEPSEEK_API_KEY-at-runtime',
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
})

// Strip markdown JSON fences a model sometimes leaks despite response_format.
export function safeParseJSON<T = any>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  return JSON.parse(cleaned) as T
}
