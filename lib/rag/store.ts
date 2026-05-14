import fs from 'node:fs/promises'
import path from 'node:path'
import type { EmbeddedChunk } from './types'

// Module-level cache. The first request triggers a disk read; subsequent requests
// hit memory. data/embeddings.json is committed to the repo so production deploys
// don't need to re-embed.
let cache: EmbeddedChunk[] | null = null

export async function loadStore(): Promise<EmbeddedChunk[]> {
  if (cache) return cache
  const file = path.join(process.cwd(), 'data', 'embeddings.json')
  try {
    const raw = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw) as { chunks: EmbeddedChunk[] }
    cache = parsed.chunks ?? []
    return cache
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      // No store yet — run `npm run rag:ingest && npm run rag:embed` first.
      cache = []
      return cache
    }
    throw e
  }
}

export function clearCache() {
  cache = null
}
