// Read every .md / .txt under corpus/, chunk it, write data/chunks.json.
// Runs offline via `npm run rag:ingest`. No API call, no env var needed.

import fs from 'node:fs/promises'
import path from 'node:path'
import { chunkMarkdown } from '../lib/rag/chunk'
import type { Chunk } from '../lib/rag/types'

const CORPUS_DIR = path.join(process.cwd(), 'corpus')
const OUT_FILE = path.join(process.cwd(), 'data', 'chunks.json')

async function main() {
  const files = await fs.readdir(CORPUS_DIR)
  const targets = files.filter(f => /\.(md|txt)$/i.test(f)).sort()
  if (targets.length === 0) {
    console.error(`No .md / .txt found in ${CORPUS_DIR}`)
    process.exit(1)
  }

  const allChunks: Chunk[] = []
  for (const fname of targets) {
    const raw = await fs.readFile(path.join(CORPUS_DIR, fname), 'utf-8')
    const chunks = chunkMarkdown(fname, raw)
    console.log(`  ${fname}: ${chunks.length} chunks (avg ${Math.round(chunks.reduce((s, c) => s + c.text.length, 0) / Math.max(chunks.length, 1))} chars)`)
    allChunks.push(...chunks)
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  await fs.writeFile(OUT_FILE, JSON.stringify({ chunks: allChunks }, null, 2), 'utf-8')

  const totalChars = allChunks.reduce((s, c) => s + c.text.length, 0)
  console.log(`\nWrote ${allChunks.length} chunks (${totalChars} chars total) to ${path.relative(process.cwd(), OUT_FILE)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
