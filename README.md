# StratSquad · 多智能体游戏策略小组

A production-ready multi-agent system for game-market strategy research: window
evaluation, competitor scans, monetization reads, policy-risk surveys.

Orchestrator + 4 expert sub-agents + judge + composer, wired as a **LangGraph
StateGraph** running on **DeepSeek V4**, **BGE-M3 hybrid RAG**, **BGE reranker**,
and **9 live trend data sources** (Google Trends / Steam / Twitch / Reddit /
YouTube / App Store / 虎牙 / 斗鱼 / 哔哩哔哩).

> 输入一个游戏战略问题，编排器拆解任务，四位专家 Agent 并行作战，评委打分，终稿合成。

---

## Architecture

```
┌──────────────────────────────┐         ┌───────────────────────────────┐
│  Vercel · Next.js frontend   │         │  FastAPI · Python LangGraph   │
│  app/                        │ ──SSE→  │  server/                      │
│   ├─ page.tsx (Territory     │  proxy  │   └─ stratsquad/              │
│   │   Studio FUI design)     │         │       ├─ graph.py (StateGraph)│
│   ├─ api/run/route.ts        │         │       ├─ nodes/  (7 agents)   │
│   └─ api/kb/ingest/route.ts  │         │       ├─ rag/    (BGE-M3)     │
└──────────────────────────────┘         │       └─ trends/ (9 sources)  │
                                          └───────────────────────────────┘
```

The Next.js routes are thin SSE proxies. All orchestration runs in Python under
LangGraph, with optional LangSmith tracing.

### Graph topology

```
START → orchestrator → ┬─ retrieve (BGE-M3 hybrid + reranker)
                       └─ trend_dispatch (LLM planner + asyncio.gather of 9 sources)
                       ↓
                       ┌─ competitor ┐
                       ├─ trend      │ ← parallel fanout
                       ├─ market     │   (trend agent cites RAG hits + live data)
                       └─ risk       ┘
                       ↓
                       judge (4-dim rubric, recompute total + verdict)
                       ↓
                       conditional retry edge
                         ├─ has retry → rerun failed experts → re-judge
                         └─ all pass  → composer
                       ↓
                       composer → END
```

LangGraph nodes emit SSE-friendly custom events at every step
(`agent_token`, `plan`, `rag_hits`, `trend_plan`, `trend_result`, `judge`,
`brief`, ...). FastAPI streams them; the frontend renders live.

---

## Capability map

| Capability                                            | Implementation                                                        |
|-------------------------------------------------------|-----------------------------------------------------------------------|
| Agentic workflow orchestration                        | LangGraph `StateGraph`, 10 nodes, conditional retry edge              |
| Self-correcting outputs                               | Judge with rubric → retry edge → re-judge once                        |
| Multi-turn dispatch + sub-agents + judge              | Built in                                                              |
| Hybrid RAG (corpus + user-uploaded KB)                | BGE-M3 dense over both → BGE-reranker top-5 (`server/stratsquad/rag/`)|
| Embedding evaluation                                  | `eval/labeled.json` (18 queries) + hit@k / MRR                        |
| Live trend data integration                           | 9 source clients (`server/stratsquad/trends/`)                        |
| Streaming UI                                          | SSE custom events, 16 event types                                     |
| Observability                                         | Optional LangSmith tracing of every node + token                      |

---

## Live trend data sources

| Source | Needs key | What it returns |
|---|---|---|
| google-trends | no | Interest-over-time + related queries for 1-5 keywords in a region |
| steam | no | Current player counts; Top 10 most-played or specific titles |
| twitch | `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | Top game viewership / streams per game |
| reddit | `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` + `REDDIT_USER_AGENT` | 30-day top posts per subreddit + aggregate scores |
| youtube | `YOUTUBE_API_KEY` | Top videos for keywords in a region, with view + like counts |
| appstore | no | iTunes RSS top-free + top-grossing games per country |
| huya | no | Mainland China livestream category viewer counts |
| douyu | no | Mainland China livestream rank list per category |
| bilibili | no | Live-area aggregates or video search top results |

All sources gracefully degrade. Missing key or upstream error → that source returns
`{ok: false, error}` and the trend agent still runs without it.

---

## Run locally

Two processes:

```bash
# Terminal 1 · Python backend
cd server
uv sync
cp .env.example .env          # fill in DEEPSEEK + SILICONFLOW + trend keys
uv run uvicorn stratsquad.main:app --reload --port 8000

# Terminal 2 · Next.js frontend
npm install
npm run dev                   # http://localhost:3002
```

The frontend reads `PYTHON_BACKEND_URL` (default `http://127.0.0.1:8000`) for proxy
target.

---

## Deploy

| Surface | Recommended host | Why |
|---|---|---|
| **Frontend** | Vercel | Native Next.js + SSE proxy at no cost |
| **Backend** | Modal / Railway / Fly.io / 腾讯云 Cloud Run | Python + long-lived SSE; Vercel serverless 300s ceiling is too tight for retry rounds |

After deploying the backend, set `PYTHON_BACKEND_URL` env var on Vercel pointing
at the backend URL. Frontend redeploys automatically.

See `server/README.md` for full backend deploy notes, including Dockerfile.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 App Router · TypeScript · Tailwind · lucide-react · marked |
| UI design | Track 2 (Industrial Console / Territory Studio FUI) per workspace DESIGN.md |
| Backend | Python 3.12 · FastAPI · uvicorn · uv |
| Orchestration | LangGraph 1.x · `StateGraph` with `Annotated[..., reducer]` channels |
| LLM | LangChain `ChatOpenAI` pointing at DeepSeek V4 (OpenAI-compatible) |
| Embedding | BGE-M3 via SiliconFlow OpenAI-compatible API |
| Reranker | BGE-reranker-v2-m3 via SiliconFlow |
| Observability | LangSmith (optional) |
| Trend data | httpx async clients, 9 sources, all stateless |

---

## License

MIT. Open-source tool for game-industry strategy research.
