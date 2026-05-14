// Evaluate retrieval quality for every embeddings file under data/.
// `data/embeddings.json` is the default; `data/embeddings-*.json` are model variants.
//
// For each query in eval/labeled.json: embed it, rank all chunks by cosine,
// then compute hit@k, recall@k, MRR. Writes eval/results.md with a comparison table.

import fs from 'node:fs/promises'
import path from 'node:path'
import { embed, EMBED_MODEL } from '../lib/rag/embed'
import type { EmbeddedChunk } from '../lib/rag/types'

type Label = { source: string; heading?: string }
type Query = { q: string; relevant: Label[] }
type Labeled = { queries: Query[] }

const KS = [1, 3, 5, 10]

async function loadDotEnv() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      const [, k, v] = m
      if (!process.env[k]) process.env[k] = v.replace(/^['"]|['"]$/g, '')
    }
  } catch { /* no .env.local */ }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}

function isRelevant(chunk: EmbeddedChunk, labels: Label[]): boolean {
  return labels.some(l =>
    l.source === chunk.source &&
    (l.heading === undefined || l.heading === chunk.heading)
  )
}

type Metrics = { hit: Record<number, number>; recall: Record<number, number>; mrr: number; n: number; model: string; dim: number }

async function evalStore(file: string, labeled: Labeled): Promise<Metrics> {
  const raw = await fs.readFile(file, 'utf-8')
  const { chunks } = JSON.parse(raw) as { chunks: EmbeddedChunk[] }
  if (chunks.length === 0) throw new Error(`${file} has no chunks`)

  const model = chunks[0].model
  const dim = chunks[0].vector.length

  console.log(`\nEvaluating ${path.basename(file)}  (${chunks.length} chunks, ${dim}-d, model=${model})`)

  // Embed all queries with the SAME model the store used. The eval script's EMBED_MODEL
  // env var controls which model embeds the *query*; the store was already embedded offline.
  // If they don't match, the cosines will be noise. We warn on mismatch.
  if (model !== EMBED_MODEL) {
    console.warn(`  warning: store model=${model} but query EMBED_MODEL=${EMBED_MODEL}. Set EMBED_MODEL=${model} to match.`)
  }

  const queryVecs = await embed(labeled.queries.map(q => q.q))

  const totals = {
    hit: Object.fromEntries(KS.map(k => [k, 0])) as Record<number, number>,
    recall: Object.fromEntries(KS.map(k => [k, 0])) as Record<number, number>,
    mrr: 0,
  }

  for (let i = 0; i < labeled.queries.length; i += 1) {
    const { q, relevant } = labeled.queries[i]
    const qVec = queryVecs[i]
    const scored = chunks
      .map(c => ({ c, score: cosine(qVec, c.vector) }))
      .sort((a, b) => b.score - a.score)

    const totalRelevant = chunks.filter(c => isRelevant(c, relevant)).length
    if (totalRelevant === 0) { console.warn(`  query "${q.slice(0, 30)}…" has 0 matching chunks; skipping`); continue }

    let firstRank = 0
    for (let rank = 0; rank < scored.length; rank += 1) {
      if (isRelevant(scored[rank].c, relevant)) { firstRank = rank + 1; break }
    }
    if (firstRank > 0) totals.mrr += 1 / firstRank

    for (const k of KS) {
      const topK = scored.slice(0, k).map(s => s.c)
      const matched = topK.filter(c => isRelevant(c, relevant)).length
      if (matched > 0) totals.hit[k] += 1
      totals.recall[k] += matched / totalRelevant
    }
  }

  const n = labeled.queries.length
  return {
    hit: Object.fromEntries(KS.map(k => [k, totals.hit[k] / n])) as Record<number, number>,
    recall: Object.fromEntries(KS.map(k => [k, totals.recall[k] / n])) as Record<number, number>,
    mrr: totals.mrr / n,
    n,
    model,
    dim,
  }
}

function fmtPct(x: number): string { return (x * 100).toFixed(1) + '%' }
function fmt3(x: number): string { return x.toFixed(3) }

function renderTable(results: Metrics[]): string {
  const lines: string[] = []
  lines.push('| Model | dim | hit@5 | hit@10 | recall@5 | recall@10 | MRR |')
  lines.push('|-------|----:|------:|-------:|---------:|----------:|----:|')
  for (const r of results) {
    lines.push(`| \`${r.model}\` | ${r.dim} | ${fmtPct(r.hit[5])} | ${fmtPct(r.hit[10])} | ${fmtPct(r.recall[5])} | ${fmtPct(r.recall[10])} | ${fmt3(r.mrr)} |`)
  }
  return lines.join('\n')
}

async function main() {
  await loadDotEnv()
  if (!process.env.SILICONFLOW_API_KEY) {
    console.error('SILICONFLOW_API_KEY missing. Add it to .env.local.')
    process.exit(1)
  }

  const labeledRaw = await fs.readFile(path.join(process.cwd(), 'eval', 'labeled.json'), 'utf-8')
  const labeled = JSON.parse(labeledRaw) as Labeled

  // Pick up data/embeddings.json and any data/embeddings-*.json variants.
  const dataDir = path.join(process.cwd(), 'data')
  const files = (await fs.readdir(dataDir))
    .filter(f => /^embeddings(-.*)?\.json$/.test(f))
    .map(f => path.join(dataDir, f))
  if (files.length === 0) { console.error('No data/embeddings*.json found. Run `npm run rag:embed` first.'); process.exit(1) }

  const results: Metrics[] = []
  for (const file of files) {
    try {
      const m = await evalStore(file, labeled)
      results.push(m)
      console.log(`  hit@5=${fmtPct(m.hit[5])}  recall@5=${fmtPct(m.recall[5])}  MRR=${fmt3(m.mrr)}`)
    } catch (e: any) {
      console.error(`  failed: ${e?.message}`)
    }
  }

  const out = `# RAG Retrieval Evaluation

Queries: ${labeled.queries.length} · scored with cosine similarity over normalized embeddings.

${renderTable(results)}

## What the columns mean

- **hit@k**: fraction of queries with at least one relevant chunk in top-k. The headline number — does the retriever surface *anything* useful?
- **recall@k**: fraction of all relevant chunks actually retrieved (averaged across queries). Punishes a retriever that finds one of two relevant chunks.
- **MRR (Mean Reciprocal Rank)**: 1 / (rank of first relevant chunk), averaged. Higher means relevant content shows up at the very top.

## How to add another model

\`\`\`bash
EMBED_MODEL=BAAI/bge-large-zh-v1.5 npx tsx scripts/embed.ts --out=data/embeddings-bge-large.json
EMBED_MODEL=BAAI/bge-large-zh-v1.5 npm run rag:eval
\`\`\`

Generated: ${new Date().toISOString()}
`

  const outPath = path.join(process.cwd(), 'eval', 'results.md')
  await fs.writeFile(outPath, out, 'utf-8')
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)}`)
}

main().catch(err => { console.error(err); process.exit(1) })
