// Take data/chunks.json, embed every chunk via SiliconFlow BGE-M3, write data/embeddings.json.
// Run offline via `npm run rag:embed`. Requires SILICONFLOW_API_KEY in .env.local.

import fs from 'node:fs/promises'
import path from 'node:path'
import { embedBatched, EMBED_MODEL, EMBED_DIM } from '../lib/rag/embed'
import type { Chunk, EmbeddedChunk } from '../lib/rag/types'

const IN_FILE = path.join(process.cwd(), 'data', 'chunks.json')
// Output can be overridden with --out=path so multiple embedding models can be compared.
const OUT_FILE = (() => {
  const arg = process.argv.find(a => a.startsWith('--out='))
  return arg ? path.resolve(process.cwd(), arg.slice('--out='.length)) : path.join(process.cwd(), 'data', 'embeddings.json')
})()

async function main() {
  // Load .env.local manually since this is a Node script, not Next.
  await loadDotEnv()

  if (!process.env.SILICONFLOW_API_KEY) {
    console.error('SILICONFLOW_API_KEY missing. Add it to .env.local first.')
    console.error('Get a key at https://cloud.siliconflow.cn (free tier covers this corpus easily).')
    process.exit(1)
  }

  const raw = await fs.readFile(IN_FILE, 'utf-8')
  const { chunks } = JSON.parse(raw) as { chunks: Chunk[] }
  console.log(`Embedding ${chunks.length} chunks with ${EMBED_MODEL} (${EMBED_DIM}-d)...`)

  const t0 = Date.now()
  const vectors = await embedBatched(chunks.map(c => c.text), 16)
  const t1 = Date.now()

  if (vectors.length !== chunks.length) {
    throw new Error(`Vector count mismatch: got ${vectors.length} for ${chunks.length} chunks`)
  }
  const dim = vectors[0]?.length
  if (dim !== EMBED_DIM) {
    console.warn(`Warning: got ${dim}-d vectors, expected ${EMBED_DIM}. Continuing.`)
  }

  const embedded: EmbeddedChunk[] = chunks.map((c, i) => ({ ...c, vector: vectors[i], model: EMBED_MODEL }))
  await fs.writeFile(OUT_FILE, JSON.stringify({ chunks: embedded }, null, 2), 'utf-8')

  const size = (await fs.stat(OUT_FILE)).size
  console.log(`\nWrote ${embedded.length} embedded chunks (${(size / 1024).toFixed(0)} KB) to ${path.relative(process.cwd(), OUT_FILE)}`)
  console.log(`Took ${(t1 - t0) / 1000}s · model: ${EMBED_MODEL} · dim: ${dim}`)
}

async function loadDotEnv() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      const [, k, v] = m
      if (!process.env[k]) process.env[k] = v.replace(/^['"]|['"]$/g, '')
    }
  } catch { /* no .env.local — rely on real env */ }
}

main().catch(err => { console.error(err); process.exit(1) })
