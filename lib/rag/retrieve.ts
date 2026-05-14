import { loadStore } from './store'
import { embed } from './embed'
import type { RagHit } from './types'

// Brute-force cosine similarity. For 1000-ish chunks, this is faster than
// any vector DB round trip — we avoid network + the JS engine's vector arithmetic
// is plenty fast for this scale.
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = a.length
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export async function retrieve(query: string, k = 5): Promise<RagHit[]> {
  const store = await loadStore()
  if (store.length === 0) return []

  const [qVec] = await embed([query])
  if (!qVec) return []

  const scored = store.map(c => ({
    id: c.id,
    source: c.source,
    heading: c.heading,
    text: c.text,
    score: cosine(qVec, c.vector),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

// Used only by the eval harness: retrieve top-k by an already-known query vector.
// Saves N embedding API calls when sweeping over labeled queries.
export async function retrieveWithVector(qVec: number[], k = 10): Promise<RagHit[]> {
  const store = await loadStore()
  const scored = store.map(c => ({
    id: c.id,
    source: c.source,
    heading: c.heading,
    text: c.text,
    score: cosine(qVec, c.vector),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}
