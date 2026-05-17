# StratSquad Python backend (LangGraph + FastAPI). Deploy to any container host
# that runs Python 3.12+: Modal, Railway, Render, Fly.io, 阿里云函数计算, etc.
#
# Build:  docker build -t stratsquad-backend -f server/Dockerfile server
# Run:    docker run -p 8000:8000 \
#           -e DEEPSEEK_API_KEY=sk-xxx \
#           -e SILICONFLOW_API_KEY=sk-xxx \
#           -e TWITCH_CLIENT_ID=... -e TWITCH_CLIENT_SECRET=... \
#           -e YOUTUBE_API_KEY=... \
#           stratsquad-backend

FROM python:3.12-slim AS deps
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

COPY --from=deps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

COPY stratsquad/ ./stratsquad/
COPY corpus/ ./corpus/
COPY data/ ./data/

EXPOSE 8000
CMD ["sh", "-c", "uvicorn stratsquad.main:app --host 0.0.0.0 --port ${PORT}"]
