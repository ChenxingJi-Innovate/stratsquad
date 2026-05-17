# Next.js frontend Dockerfile.
#
# This image runs ONLY the UI (SSE proxy + React app). The multi-agent LangGraph
# pipeline runs in a separate Python container — see server/Dockerfile.
#
# Build:  docker build -t stratsquad-frontend .
# Run:    docker run -p 7860:7860 \
#           -e PYTHON_BACKEND_URL=https://your-python-host \
#           stratsquad-frontend

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7860
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 7860
CMD ["node", "server.js"]
