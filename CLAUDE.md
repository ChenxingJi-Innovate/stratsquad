# StratSquad

> Multi-agent game-industry strategy copilot. Orchestrator + 4 parallel sub-agents + judge + composer, powered by DeepSeek V4. Built for the Tencent TiMi *AI 策略工程师* JD.

See parent workspace `../CLAUDE.md` for shared context, glossary, and house style (no em dashes, etc.).

## Pipeline

```
Strategy question (+ optional corpus paste)
  → Orchestrator: decompose into 4 sub-briefs
  → RAG retrieval: trend brief → embed (BGE-M3 via SiliconFlow) → top-5 chunks
  → Parallel: Competitor / Trend / Market / Risk agents (trend gets RAG hits as citations)
  → Judge: scores each on 4 rubrics (evidence/logic/actionability/novelty), 0-100, threshold 70
  → Retry: any sub-agent below threshold gets one fresh attempt with a stricter prompt
  → Re-judge after retries
  → Composer: integrate 4 outputs into a 战略简报.md
```

## File layout

```
app/
├── layout.tsx               root layout
├── page.tsx                 single-page UI: hero + input + live agent timeline + judge grid + brief
├── globals.css              tailwind + prose-brief markdown styles
└── api/run/route.ts         SSE streaming orchestration (Node runtime, 300s max duration)

lib/
├── deepseek.ts              OpenAI SDK pointed at api.deepseek.com; model from DEEPSEEK_MODEL env (default deepseek-v4-flash)
├── stream.ts                SSEWriter wrapping ReadableStream controller
├── types.ts                 StreamEvent / JudgeScore / Subtask / AgentName / RagHit / labels
├── agents/
│   ├── _run.ts              runStreamed (token-streamed) and runJSON (parsed) helpers
│   ├── orchestrator.ts      → Subtask[4]
│   ├── competitor.ts        markdown, retry-aware via attempt arg
│   ├── trend.ts             markdown, takes RagHit[] for grounded citations
│   ├── market.ts            markdown
│   ├── risk.ts              markdown
│   ├── judge.ts             → JudgeScore[4]
│   └── composer.ts          → markdown
└── rag/
    ├── types.ts             Chunk, EmbeddedChunk, RagHit
    ├── chunk.ts             CJK-aware chunker (~400 chars, 60 char overlap, heading-tracked)
    ├── embed.ts             SiliconFlow BGE-M3 client (OpenAI-compatible)
    ├── store.ts             lazy-load data/embeddings.json once per Node process
    └── retrieve.ts          brute-force cosine top-k (sub-ms for <1K chunks)

scripts/                     offline pipeline (npm run rag:*), runs via tsx
├── ingest.ts                corpus/*.md → data/chunks.json
├── embed.ts                 data/chunks.json → data/embeddings.json (supports --out=path)
└── eval.ts                  data/embeddings*.json + labeled.json → eval/results.md

corpus/, data/, eval/        knowledge base, embeddings, labeled eval set
```

## Key conventions

- All API calls live server-side in `app/api/run/route.ts` and `lib/agents/*`. Never call DeepSeek from the client.
- The SSE route uses `runtime: 'nodejs'` (Edge has issues with the OpenAI SDK's body stream). `maxDuration: 300` for Vercel Pro.
- Model is `process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash'` in one place (`lib/deepseek.ts`). Swap models there.
- Each agent module exports a single `runX(...)` async function. The orchestrator at `app/api/run/route.ts` chains them.
- Sub-agents run via `Promise.all`. Their token streams interleave on the wire; the UI uses `event.agent` to route deltas.
- Judge defensively recomputes `total` (weighted) and `verdict` so the model can't lie about pass/fail.
- Retry loop is bounded to one round. Worst-case wall-clock ≈ 2× a clean run.

## Prompt design notes

- Orchestrator prompt is the only one that's JSON-mode. Sub-agents and composer return markdown.
- Each sub-agent accepts an `attempt` arg. `attempt > 1` injects a "上一轮证据不足" stricter clause that demands quantification.
- Composer enforces a 7-heading template so the brief is predictable for downstream parsing / training.
- All prompts are in Chinese (UI 中文 by default per workspace style). Code comments in English.
- No em dashes in any generated text (workspace house style enforced via composer prompt).

## Event protocol

`StreamEvent` union in `lib/types.ts`. UI deserializes from `data: <json>\n\n` lines. Adding a new event:

1. Add a variant to `StreamEvent` in `lib/types.ts`
2. `sse.emit(...)` from inside an agent or the orchestration route
3. Add a case in `handleEvent` in `app/page.tsx`

## Run

```bash
npm install
echo "DEEPSEEK_API_KEY=sk-xxx" > .env.local
npm run dev
# http://localhost:3002
```

## RAG specifics

- Default embedding model is `BAAI/bge-m3` (1024-d) via SiliconFlow's OpenAI-compatible endpoint.
- Query used for retrieval is the **trend agent's brief** (orchestrator output), not the raw user question — the brief is sharper and produces better hits.
- Top-k = 5 by default; tweak in `app/api/run/route.ts`.
- `data/embeddings.json` is checked into git so production deploys don't need an embedding API call at build time. Only query embedding hits SiliconFlow at request time.
- If `SILICONFLOW_API_KEY` is missing OR `data/embeddings.json` is empty, the run silently skips RAG and falls back to letting trend agent rely on parametric knowledge.
- Eval set (`eval/labeled.json`) maps queries → (source, heading) tuples, so chunking changes don't invalidate the labels.

## Iteration ideas (not yet built)

- Hybrid retrieval (BM25 + dense reranker) for technical queries.
- MCP server wrapper: expose `/api/run` as an MCP tool, drop into Claude Desktop / Cursor.
- Tool-calling sub-agents: give competitor agent a Sensor Tower / GameLook scraper tool.
- SFT export: rate each composed brief, ship JSONL for fine-tuning a "TiMi-style" strategy writer.
- Eval harness for the LLM (not just the retriever): ~30 strategy questions, head-to-head DeepSeek V4 / V4-Flash / Reasoner / GPT-4o-mini.

## Anti-patterns to avoid

- Don't call DeepSeek from client; key would leak.
- Don't run sub-agents sequentially; you'll exceed Vercel's 300s limit on heavy questions.
- Don't trust the judge's own `total` field; recompute.
- Don't retry more than once; double-retries explode cost and rarely improve quality.
- Don't render the composer output without markdown parsing; the prompt explicitly produces markdown.
