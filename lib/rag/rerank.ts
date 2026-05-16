// BGE-reranker via SiliconFlow's rerank endpoint.
// Docs: https://docs.siliconflow.cn/cn/api-reference/rerank/create-rerank
// Falls back to returning input unchanged if API key missing or request fails.

import type { RagHit } from './types'

export const RERANK_MODEL = process.env.RERANK_MODEL ?? 'BAAI/bge-reranker-v2-m3'
const BASE = process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1'

export async function rerank(query: string, hits: RagHit[], topK = 5): Promise<RagHit[]> {
  if (hits.length === 0) return []
  const key = process.env.SILICONFLOW_API_KEY
  if (!key) return hits.slice(0, topK)   // graceful fallback when key not configured

  try {
    const res = await fetch(`${BASE}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: hits.map(h => h.text),
        top_n: Math.min(topK, hits.length),
        return_documents: false,
      }),
    })
    if (!res.ok) return hits.slice(0, topK)

    const json = await res.json() as { results: Array<{ index: number; relevance_score: number }> }
    const ranked = (json.results ?? [])
      .map(r => ({ ...hits[r.index], rerankScore: r.relevance_score }))
      .filter(Boolean)
    return ranked.slice(0, topK)
  } catch {
    return hits.slice(0, topK)
  }
}
