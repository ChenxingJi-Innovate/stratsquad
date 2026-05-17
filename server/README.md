# StratSquad backend · Python LangGraph

Multi-agent strategy pipeline implemented as a LangGraph `StateGraph`, served behind
FastAPI with SSE streaming. The Next.js frontend (`../app`) proxies `/api/run` and
`/api/kb/ingest` to this service.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  POST /api/run                                                     │
│       ↓                                                            │
│  StateGraph (langgraph)                                            │
│       │                                                            │
│       ├─ orchestrator       ─ DeepSeek JSON → 4 Subtasks          │
│       │                                                            │
│       ├─ retrieve           ─ BGE-M3 hybrid (corpus + user KB)    │
│       │                       → BGE-reranker → top-5 hits         │
│       │                                                            │
│       ├─ trend_dispatch     ─ LLM planner picks 4-7 sources       │
│       │                       → asyncio.gather() of 9 source      │
│       │                       clients (Google Trends / Steam /    │
│       │                       Twitch / Reddit / YouTube /         │
│       │                       App Store / Huya / Douyu / Bilibili)│
│       │                                                            │
│       ├─ competitor / trend / market / risk  ← parallel fanout    │
│       │                                                            │
│       ├─ judge              ─ 4-dim rubric, recompute total       │
│       │                                                            │
│       ├─ conditional edge   ─ if any verdict='retry' → rerun       │
│       │                       failed experts once → re-judge       │
│       │                                                            │
│       └─ composer           ─ final markdown brief                 │
│             ↓                                                       │
│         SSE custom events ─→ client                                │
└────────────────────────────────────────────────────────────────────┘
```

Every node emits LangGraph custom events (`agent_token`, `plan`, `rag_hits`,
`trend_plan`, `trend_result`, `judge`, `brief`, ...) via `get_stream_writer()`.
`main.py` forwards each emitted event as one `data: <json>\n\n` SSE line, matching
the wire format the frontend has always expected.

## Run locally

```bash
cd server
uv sync                                    # install Python deps
cp .env.example .env                       # fill in DEEPSEEK + SILICONFLOW + the trend keys
uv run uvicorn stratsquad.main:app --reload --port 8000
```

Health: `curl http://127.0.0.1:8000/api/health`.

Then in another terminal start the frontend:

```bash
cd ..
npm run dev                                # http://localhost:3002
```

The frontend's `app/api/run` route reads `PYTHON_BACKEND_URL` (default
`http://127.0.0.1:8000`) and proxies SSE through.

## Deploy

The Python service runs anywhere Python 3.12+ + outbound TCP works.

| Host | Notes |
|---|---|
| **Modal** | `modal serve stratsquad/main.py` — GPU not needed, $0 idle. Best for demo. |
| **Railway** | one-click; `Dockerfile` above; set env vars in the UI |
| **Fly.io** | `fly launch --dockerfile server/Dockerfile`; supports 24h SSE streams |
| **Render** | Free tier sleeps; OK for demo, not interview-day |
| **腾讯云 Cloud Run / 阿里云函数计算** | low latency from China; 24h+ SSE timeout supported |
| **VPS (DigitalOcean / 腾讯云轻量)** | `docker run` with the Dockerfile; reverse-proxy via Caddy/nginx |

Vercel is **not** supported as the backend host (serverless functions have a 60s
limit on Hobby and a 300s ceiling on Pro; full runs need 60-300s of streaming).

After deploying, set `PYTHON_BACKEND_URL` on the Vercel frontend project to point
at the public Python host.

## RAG ingest / eval

```bash
# Regenerate chunks + embeddings + eval after editing corpus/
uv run python -m stratsquad.scripts.ingest      # corpus/*.md → data/chunks.json
uv run python -m stratsquad.scripts.embed       # data/chunks.json → data/embeddings.json
uv run python -m stratsquad.scripts.eval        # against eval/labeled.json
```

(scripts are TODO ports; for now regenerate by running the matching `npm run rag:*`
in a checkout of the legacy TS version, or use the embeddings.json committed in
`data/`.)

## LangSmith tracing

Set `LANGSMITH_API_KEY` from https://smith.langchain.com — every graph run shows up
in the LangSmith project `stratsquad` with full token-level traces, node timings,
and cost.
