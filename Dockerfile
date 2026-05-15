# Multi-stage Next.js Dockerfile. Works on any container host:
#   - ModelScope 创空间 (Docker mode, port 7860)
#   - HuggingFace Spaces (Docker SDK, port 7860)
#   - 阿里云函数计算 / 腾讯云 Cloud Run (any port via PORT env)
#   - Railway / Fly.io / Render (any port via PORT env)
#   - any K8s / VPS
#
# Build:   docker build -t stratsquad .
# Run:     docker run -p 7860:7860 -e DEEPSEEK_API_KEY=sk-xxx -e SILICONFLOW_API_KEY=sk-xxx stratsquad
# Default port 7860 matches HF / ModelScope; override with -e PORT=3002 if needed.

# ─── 1. deps: install production-only deps ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# alpine needs libc6-compat for next-swc native bindings
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

# ─── 2. builder: build the Next.js app + standalone server ─────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── 3. runner: minimal runtime image ──────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Default to 7860 (HuggingFace / ModelScope convention); any host can override.
ENV PORT=7860
ENV HOSTNAME=0.0.0.0

# Non-root user for hardened containers
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy the standalone server output produced by `output: 'standalone'` in next.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# RAG artifacts shipped with the image so the trend agent can cite real numbers
# the moment the container boots. data/embeddings.json (if present) is loaded
# lazily by lib/rag/store.ts on first request.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/corpus ./corpus

USER nextjs
EXPOSE 7860

# next.config.mjs `output: 'standalone'` generates server.js as the entrypoint
CMD ["node", "server.js"]
