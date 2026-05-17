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

### Modal (recommended for AI / agent workloads)

`modal_deploy.py` wraps the FastAPI app as a Modal ASGI app. Free tier is $30/mo
credits; you won't run out at demo traffic.

```bash
pip install modal
modal token new                              # browser auth, free signup at modal.com

# Push your local .env to Modal as a named secret
cd server
modal secret create stratsquad-env --from-dotenv .env

# Deploy
modal deploy modal_deploy.py
# → outputs https://<workspace>--stratsquad-fastapi-app.modal.run

# Health check
curl https://<workspace>--stratsquad-fastapi-app.modal.run/api/health
```

Then on Vercel, **Settings → Environment Variables**, add
`PYTHON_BACKEND_URL=https://<workspace>--stratsquad-fastapi-app.modal.run`,
redeploy, done.

### Other hosts

| Host | Notes |
|---|---|
| **Fly.io** | `fly launch --dockerfile server/Dockerfile` — long SSE supported |
| **Railway** | one-click on Dockerfile; $5/mo entry |
| **Render** | Free tier sleeps; OK for off-hours demo |
| **Google Cloud Run** | most "industry standard"; 60-minute timeout; needs GCP project |
| **腾讯云 Cloud Run** | low latency from China; 24h+ SSE supported |
| **VPS (DigitalOcean / 腾讯云轻量)** | `docker run` with the Dockerfile + Caddy reverse proxy |

Vercel is **not** supported as the backend host: serverless functions have a 60s
limit on Hobby and a 300s ceiling on Pro; full runs (especially with the retry
round) need 60-300s of continuous streaming.

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
