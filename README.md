# StratSquad · 多智能体游戏策略小组

A production-ready multi-agent system for game industry strategy work. Built for the Tencent TiMi *AI 策略工程师 (实习)* JD pattern: orchestrator + sub-agents + judge + composer, all powered by DeepSeek V4 via its OpenAI-compatible API.

> 输入一个游戏战略问题，编排器拆解任务，四位专家 Agent 并行作战，评委打分，终稿合成。

---

## What it does

**Input:** 一个游戏战略问题 (例：MOBA 在东南亚的窗口期评估)，可选附带行业报告片段作为 RAG 语料。

**Pipeline:**

```
                        ┌─ Competitor Agent ─┐
   Strategy Question    │                    │
        │               ├─ Trend Agent ──────┤    Judge Agent          Composer
        ▼               │                    │    (4 rubrics,         (final brief)
   Orchestrator ──→ 4 Sub-briefs ──parallel──┤    threshold 70) ──→   战略简报.md
                        │                    │       │
                        ├─ Market Agent ─────┤       │
                        │                    │       │
                        └─ Risk Agent ───────┘       │
                                                     ▼
                                              retry sub-agents
                                              that scored < 70
                                              (one round)
```

**Output:** 一份结构化的 markdown 战略简报 + 完整 JSON (问题 + plan + 4 份原始输出 + 评分 + 终稿)，可直接用作 SFT / DPO 训练数据。

---

## Why this maps to the JD

| JD line                                               | How StratSquad covers it                                              |
|-------------------------------------------------------|-----------------------------------------------------------------------|
| 推动 AI 原生工作流落地, 设计行业领先的 Agentic 工作流 | 7-agent pipeline, orchestrator-driven decomposition                   |
| 制定 AI 运用整体规划, 撰写 PRD                        | This README + `/CLAUDE.md` are the PRD                                |
| 维护和升级 AI 工具, 持续提升 Agent 输出质量           | Judge-driven retry loop with explicit 4-dim rubric                    |
| (加分) 多轮工具调用 + 子 agent + 评委                 | Exactly the architecture here                                         |
| (加分) 中文 RAG                                       | BGE-M3 over `corpus/`, brute-force cosine, labeled hit@k / MRR eval   |
| (加分) BGE / E5 / OpenAI Embedding 调参与评测         | `npm run rag:eval` produces a side-by-side comparison table           |
| (加分) MCP 协议 / IDE Agent 生态                      | `mcp/server.ts` exposes `stratsquad_run` + `stratsquad_retrieve` tools|
| (加分) 后端 / 知识库开发经验                          | SSE streaming route, type-safe event protocol, RAG store, MCP server  |
| Python / TypeScript                                   | TypeScript, OpenAI-compatible SDK pointed at DeepSeek                 |

---

## Architecture

### Runtime layout

```
app/
├── api/run/route.ts          SSE streaming orchestration endpoint (Node runtime)
├── page.tsx                  single-page UI: timeline + RAG hits + judge grid + brief
├── layout.tsx
└── globals.css

lib/
├── deepseek.ts               OpenAI SDK pointed at api.deepseek.com
├── stream.ts                 SSEWriter + sse headers
├── types.ts                  shared types: StreamEvent, JudgeScore, Subtask, RagHit
├── agents/
│   ├── _run.ts               runStreamed / runJSON helpers
│   ├── orchestrator.ts       decomposes question → 4 sub-briefs
│   ├── competitor.ts         产品矩阵, 玩法, 商业化, 运营
│   ├── trend.ts              市场规模, 玩家行为, 技术驱动力, 窗口期 (takes RAG hits)
│   ├── market.ts             宏观, 支付, 本地化, 获客
│   ├── risk.ts               版号, 平台抽成, 内容审查, 数据合规
│   ├── judge.ts              4-dim rubric (0-100), threshold 70
│   └── composer.ts           整合 4 份输出 → 战略简报.md
└── rag/
    ├── types.ts              Chunk, EmbeddedChunk, RagHit
    ├── chunk.ts              CJK-aware chunker, heading-tracked
    ├── embed.ts              SiliconFlow BGE-M3 API caller
    ├── store.ts              lazy-load data/embeddings.json
    └── retrieve.ts           brute-force cosine top-k

scripts/                      offline pipeline (npm run rag:*)
├── ingest.ts                 corpus/*.md → data/chunks.json
├── embed.ts                  data/chunks.json → data/embeddings.json
└── eval.ts                   data/embeddings*.json + labeled.json → eval/results.md

corpus/                       game industry source documents (5 markdown files seeded)
data/                         chunks.json, embeddings.json (committed to repo)
eval/                         labeled.json (22 queries), results.md (auto-generated)
```

### Event protocol

The `/api/run` endpoint streams Server-Sent Events. Each line is `data: <json>\n\n`:

| event              | when                              | payload                                |
|--------------------|-----------------------------------|----------------------------------------|
| `agent_start`      | each agent boots                  | `{agent}`                              |
| `agent_token`      | every streamed token              | `{agent, delta}`                       |
| `agent_done`       | agent finished                    | `{agent, content}`                     |
| `plan`             | orchestrator output ready         | `{subtasks: Subtask[]}`                |
| `rag_hits`         | retriever returned top-k chunks   | `{query, hits: RagHit[]}`              |
| `subagents_done`   | all 4 sub-agents finished         | `{outputs: Record<SubAgent, string>}`  |
| `judge`            | judge produced scores             | `{scores: JudgeScore[]}`               |
| `retry`            | a sub-agent fell below threshold  | `{agent, reason}`                      |
| `brief`            | composer finished                 | `{markdown}`                           |
| `complete`         | run finished                      | `{}`                                   |
| `error`            | something blew up                 | `{message}`                            |

### Why this is "deliverable", not a toy

- All agents stream tokens, so the UI is live, not a 60-second spinner.
- Sub-agents run in parallel via `Promise.all` (4× wall-clock speedup vs sequential).
- Judge defensively recomputes the weighted total in case the model fudges the math.
- Orchestrator is JSON-mode + schema-validated; bad plans throw early.
- Retry loop is bounded (one round), so worst case is 2× cost not infinite.
- `runtime: 'nodejs'` + `maxDuration: 300` for Vercel Pro streaming.
- Stateless: no DB, no auth, single API call surface — drop into any Vercel project.

---

## Run locally

```bash
npm install
echo "DEEPSEEK_API_KEY=sk-xxx" > .env.local
npm run dev
# http://localhost:3002
```

Optional env vars:

```bash
DEEPSEEK_MODEL=deepseek-v4-flash             # default; use deepseek-v4 or deepseek-reasoner if needed
DEEPSEEK_BASE_URL=https://api.deepseek.com   # default
SILICONFLOW_API_KEY=sk-xxx                   # required if you want RAG enabled (BGE-M3 via SiliconFlow)
EMBED_MODEL=BAAI/bge-m3                      # default
```

---

## RAG (Chinese RAG with BGE-M3, brute-force cosine, no vector DB)

StratSquad ships with a small built-in RAG over `corpus/*.md` so the trend agent can cite real numbers instead of guessing. The whole thing is ~200 lines of TypeScript, deploys to Vercel as-is.

### One-command build

```bash
echo "SILICONFLOW_API_KEY=sk-xxx" >> .env.local
npm run rag:all
# ingest (chunk markdown) → embed (BGE-M3 via SiliconFlow) → eval (recall@k / MRR table)
```

### Pipeline

```
corpus/*.md
  → scripts/ingest.ts  (CJK-aware chunker, ~400 chars, 60 char overlap, heading-tracked)
  → data/chunks.json

data/chunks.json
  → scripts/embed.ts   (BGE-M3 via SiliconFlow OpenAI-compatible API, batched 16-at-a-time)
  → data/embeddings.json    (~28 chunks × 1024-d ≈ 250 KB, commit to repo)

Runtime:
  → lib/rag/store.ts        (lazy-loaded into memory once per Node process)
  → lib/rag/retrieve.ts     (brute-force cosine top-k, sub-ms for our corpus)
  → /api/run                emits a `rag_hits` SSE event with the top-5 chunks
  → trend agent prompt      receives chunks as [#1] [#2] ... structured citations
  → UI panel                shows source + heading + sim score + text body for each hit
```

### Why no ChromaDB / Pinecone / Qdrant

- 28 chunks at 1024-d = 110 KB of floats; cosine over all of it in JS is sub-ms
- No infra, no network round trip, no cold start. Vercel cold-boot still under 500 ms.
- The moment the corpus passes ~5000 chunks, swap `lib/rag/retrieve.ts` for a Qdrant call. Until then, brute-force wins.

### Embedding model evaluation

```bash
# Embed with the default model and run the eval
SILICONFLOW_API_KEY=sk-xxx npm run rag:embed
SILICONFLOW_API_KEY=sk-xxx npm run rag:eval
# → writes eval/results.md with hit@5 / recall@5 / MRR

# Add a second model to compare
EMBED_MODEL=BAAI/bge-large-zh-v1.5 npx tsx scripts/embed.ts --out=data/embeddings-bge-large.json
EMBED_MODEL=BAAI/bge-large-zh-v1.5 npx tsx scripts/eval.ts
# → results.md now lists both models side-by-side
```

The labeled eval set (`eval/labeled.json`) has 22 hand-written Chinese queries mapped to (source, heading) ground truths. Adding more is just a JSON edit.

### Adding your own corpus

1. Drop more `.md` or `.txt` files into `corpus/`. Headings (`##`) are tracked as section labels.
2. `npm run rag:ingest && npm run rag:embed`
3. Commit `data/embeddings.json` so production deploys don't need to re-embed.

---

## MCP server · wire StratSquad into Claude Desktop / Cursor / Windsurf

StratSquad also ships as a Model Context Protocol server. Once registered, Claude Desktop (or any MCP-aware IDE / agent) can invoke the full multi-agent pipeline as a single tool call.

### Two tools exposed

| Tool | What it does |
|------|--------------|
| `stratsquad_run` | Runs the full pipeline (orchestrator → 4 sub-agents → judge → composer + RAG) and returns the final markdown brief, judge scores, and RAG hits. |
| `stratsquad_retrieve` | Just runs RAG retrieval (no LLM). Useful for debugging retrieval quality or sanity-checking what a query hits. |

### Boot manually

```bash
npm run mcp
# stderr: "StratSquad MCP server ready on stdio"
# stdout is reserved for the MCP wire protocol
```

### Register with Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "stratsquad": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/StratSquad/mcp/server.ts"],
      "env": {
        "DEEPSEEK_API_KEY": "sk-xxx",
        "SILICONFLOW_API_KEY": "sk-xxx"
      }
    }
  }
}
```

Restart Claude Desktop. The `stratsquad_run` and `stratsquad_retrieve` tools should appear in the slash-tool menu.

### Register with Cursor / Windsurf

Same JSON shape goes into `~/.cursor/mcp.json` (Cursor) or the equivalent IDE-specific path.

### Quick stdin test (without an MCP client)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run mcp
# should reply with the 2-tool catalog
```

---

## Deploy

The repo ships with a multi-stage `Dockerfile` (`output: 'standalone'` enabled), so any container-aware host works. Pick whichever matches your audience.

### Option A · Vercel (zero-config Next.js)

1. Push to a Git repo, import on vercel.com
2. Settings → Environment Variables → `DEEPSEEK_API_KEY`, `SILICONFLOW_API_KEY`
3. Deploy. The orchestration endpoint uses Node runtime with `maxDuration: 300`. **Pro plan required** for streams over 60s (a full 4-agent run takes ~40-90s with `deepseek-v4-flash`). Hobby plan will get truncated.

### Option B · ModelScope 创空间 (China-native, lowest API latency to DeepSeek/SiliconFlow)

1. https://modelscope.cn/studios/create → SDK = **Docker**, hardware = CPU Basic (free)
2. Connect this GitHub repo or upload the source
3. Settings → 环境变量 → add `DEEPSEEK_API_KEY` and `SILICONFLOW_API_KEY`
4. ModelScope auto-builds from the root `Dockerfile`. Default port 7860 matches.
5. URL pattern: `https://modelscope.cn/studios/<user>/stratsquad`

Why this option is strong: ModelScope nodes are in mainland China, so DeepSeek / SiliconFlow API calls have sub-100ms RTT. Vercel/HF nodes go through GFW, often 500-2000ms.

### Option C · HuggingFace Spaces (international ML community visibility)

1. https://huggingface.co/new-space → SDK = **Docker**, hardware = CPU basic (free, 2 vCPU / 16GB)
2. Push this repo to the Space (HF Spaces is just a Git remote)
3. Settings → Variables and secrets → add `DEEPSEEK_API_KEY` and `SILICONFLOW_API_KEY` as **secrets**
4. HF auto-builds from the root `Dockerfile`. Default port 7860 matches.

Trade-off: HF nodes are in US/EU, so calls to mainland Chinese APIs (DeepSeek, SiliconFlow) have +500ms latency and occasional retry.

### Option D · 阿里云函数计算 / 腾讯云 Cloud Run

1. Build and push Docker image: `docker build -t stratsquad . && docker tag stratsquad <registry>/stratsquad && docker push <registry>/stratsquad`
2. 阿里云: 函数计算 → 创建服务 → 自定义运行时容器镜像 → 指向你的镜像
3. 腾讯云: Cloud Run → 创建服务 → 容器镜像
4. Both support 24h+ timeouts (plenty for 300s SSE streams). China-native = low API latency.

### Option E · Railway / Fly.io / Render

```bash
# Railway: connect GitHub, auto-detects Next.js, no Dockerfile needed
# Or use Docker mode pointing at this Dockerfile
# Free tier $5 credit/month; $5/month after that.
```

No timeout caps, supports SSE, $5/month entry tier.

### Option F · 腾讯云轻量服务器 / DigitalOcean Droplet (cheapest, full control)

```bash
ssh root@your-vps
git clone https://github.com/ChenxingJi-Innovate/stratsquad
cd stratsquad
docker build -t stratsquad .
docker run -d --restart=always -p 80:7860 \
  -e DEEPSEEK_API_KEY=sk-xxx -e SILICONFLOW_API_KEY=sk-xxx \
  --name stratsquad stratsquad
```

腾讯云轻量 ¥24/年起，DigitalOcean $4/月，长期最划算。

### Local Docker test (before any cloud deploy)

```bash
docker build -t stratsquad .
docker run -p 7860:7860 \
  -e DEEPSEEK_API_KEY=sk-xxx \
  -e SILICONFLOW_API_KEY=sk-xxx \
  stratsquad
# → http://localhost:7860
```

---

## Extension ideas

- **More embedding models**: drop `EMBED_MODEL=...` into `.env.local` and re-run `npm run rag:embed -- --out=data/embeddings-${slug}.json`, then `npm run rag:eval` to extend the comparison table. Currently configured for SiliconFlow models; add another provider by writing a sibling of `lib/rag/embed.ts`.
- **Hybrid retrieval**: layer BM25 (lexical) over BGE (dense) and rerank — typically +5-10pp recall@5 for technical queries. Bun's built-in regex tokenizer + a 50-line BM25 implementation is enough.
- **MCP server wrapper**: expose `/api/run` as an MCP tool so Claude Desktop / Cursor can invoke the squad directly. Covers JD bonus "MCP 协议 / IDE Agent 生态".
- **Tool calling**: give the competitor agent a real Sensor Tower / GameLook scraper as a tool. Currently it relies on parametric knowledge.
- **SFT export**: rate each composed brief 1-5 stars, package as JSONL for fine-tuning a domain-specific strategy writer.
- **Eval the LLM, not just the retriever**: build a ~30 strategy question rubric set, compare DeepSeek V4 / V4-Flash / Reasoner / GPT-4o head-to-head.

---

## Design system

UI follows the workspace standard: Pinterest Gestalt tokens (4px grid, 6 font sizes, 9-step rounding, pushpin red accent) layered with Apple HIG art direction (clamp display type, frosted glass, cubic-bezier easing). See `../DESIGN.md`.

---

## License

MIT, internal demo. Built for interview / portfolio use.
