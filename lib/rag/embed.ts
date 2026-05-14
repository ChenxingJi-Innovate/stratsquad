// SiliconFlow (硅基流动) hosts BGE-M3 with an OpenAI-compatible endpoint.
// Docs: https://docs.siliconflow.cn/cn/api-reference/embeddings/create-embeddings
//
// We use the bare fetch API here (not the OpenAI SDK) because we want to
// batch many inputs in one call, and SiliconFlow's batching shape matches
// OpenAI's "input: string | string[]" form cleanly.

export const EMBED_MODEL = process.env.EMBED_MODEL ?? 'BAAI/bge-m3'
export const EMBED_DIM = 1024
const BASE = process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1'

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const key = process.env.SILICONFLOW_API_KEY
  if (!key) throw new Error('SILICONFLOW_API_KEY not set')

  const res = await fetch(`${BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
      encoding_format: 'float',
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`SiliconFlow embed failed: ${res.status} ${detail.slice(0, 300)}`)
  }

  const json = await res.json() as { data: { embedding: number[]; index: number }[] }
  // Re-order by index just in case the API doesn't guarantee it.
  const out: number[][] = new Array(texts.length)
  for (const row of json.data) out[row.index] = row.embedding
  return out
}

// Batch helper for offline embed scripts. SiliconFlow accepts ~64 inputs per call, but
// we batch smaller (16) so a single retry on failure is cheap.
export async function embedBatched(texts: string[], batchSize = 16): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const vecs = await embed(batch)
    out.push(...vecs)
  }
  return out
}
