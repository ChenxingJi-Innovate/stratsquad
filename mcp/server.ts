// MCP (Model Context Protocol) server exposing StratSquad as 2 tools:
//   - stratsquad_run:      full multi-agent strategy pipeline → final brief + scores
//   - stratsquad_retrieve: just RAG retrieval over corpus/ → top-k chunks
//
// Wired into Claude Desktop / Cursor / Windsurf via the standard MCP config — see README.
//
// Runs over stdio (the canonical MCP transport for locally-launched servers).

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import fs from 'node:fs/promises'
import path from 'node:path'

// Load .env.local before any module that reads process.env at import time
// (the OpenAI client in lib/deepseek.ts captures the key at construction).
async function loadDotEnv() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      const [, k, v] = m
      if (!process.env[k]) process.env[k] = v.replace(/^['"]|['"]$/g, '')
    }
  } catch { /* no .env.local — rely on real env */ }
}

async function main() {
  await loadDotEnv()

  // Dynamic imports so deepseek client construction sees the loaded env vars.
  const { runPipeline } = await import('../lib/pipeline')
  const { BufferSink } = await import('../lib/stream')
  const { retrieve } = await import('../lib/rag/retrieve')
  const { AGENT_LABEL_ZH } = await import('../lib/types')

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY missing. Add it to .env.local before starting the MCP server.')
    process.exit(1)
  }

  const server = new Server(
    { name: 'stratsquad', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'stratsquad_run',
        description:
          '运行完整的多智能体游戏战略分析流水线。Orchestrator 拆解问题 → 4 位专家 Agent 并行作战 ' +
          '(竞品 / 趋势 / 区域 / 风险) → 评委 4 维评分 (低于 70 触发 retry) → Composer 合成简报。' +
          '内置中文 RAG (BGE-M3 over corpus/) 给 trend Agent 提供引用。' +
          '返回 markdown 战略简报 + 评委分数 + RAG 命中。',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: '要分析的战略问题。例：评估 2026 下半年发布一款 MOBA 手游进入东南亚市场的窗口期、竞品壁垒、商业化路径与主要政策风险',
            },
            corpus: {
              type: 'string',
              description: '可选的额外语料 (报告片段 / 数据 / 内部文档)。会传给 orchestrator 做 plan 提示。RAG 检索是独立的，跑在 corpus/ 目录上。',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'stratsquad_retrieve',
        description:
          '只跑 RAG 检索，不走 LLM。在已经 embed 的语料 (data/embeddings.json) 上做 BGE-M3 cosine top-k。' +
          '用于快速调试检索质量，或单独验证某个 query 能命中哪些段落。',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '检索 query (中文或英文均可)' },
            k: { type: 'number', description: '返回前 k 条，默认 5', default: 5 },
          },
          required: ['query'],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params

    if (name === 'stratsquad_run') {
      const { question, corpus = '' } = (args ?? {}) as { question?: string; corpus?: string }
      if (!question?.trim()) throw new Error('Missing required argument: question')

      const sink = new BufferSink()
      const result = await runPipeline(question, corpus, sink)

      const scoresMd = result.scores.map(s =>
        `- **${AGENT_LABEL_ZH[s.agent]}** (${s.agent}) → 总分 **${s.total}** · 证据 ${s.evidence} · 逻辑 ${s.logic} · 可执行 ${s.actionability} · 新颖 ${s.novelty} · ${s.verdict}\n  > ${s.reason}`
      ).join('\n')

      const hitsMd = result.hits.length === 0
        ? '_(无 RAG 命中：未配置 SILICONFLOW_API_KEY 或 data/embeddings.json 缺失)_'
        : result.hits.map((h, i) =>
            `[#${i + 1}] **${h.source}**${h.heading ? ` · §${h.heading}` : ''} · sim ${h.score.toFixed(3)}\n${h.text.slice(0, 240)}${h.text.length > 240 ? '…' : ''}`
          ).join('\n\n')

      const trendMd = !result.trendBundle || result.trendBundle.results.length === 0
        ? '_(无实时趋势数据：planner 未选源或所有源均失败)_'
        : result.trendBundle.results.map(r =>
            r.ok
              ? `**${r.label}** (${r.source}, ${r.latencyMs}ms): ${r.summary}`
              : `**${r.label}** (${r.source}, FAILED): ${r.error}`
          ).join('\n\n')

      const retriesMd = result.retries.length > 0
        ? `\n\n_(本次有 ${result.retries.length} 位 Agent 触发了 retry: ${result.retries.join(', ')})_`
        : ''

      const text = `# 战略简报\n\n${result.brief}\n\n---\n\n## 评委评分\n\n${scoresMd}${retriesMd}\n\n---\n\n## 实时趋势数据\n\n${trendMd}\n\n---\n\n## RAG 命中 (top-${result.hits.length})\n\n${hitsMd}\n`

      return { content: [{ type: 'text', text }] }
    }

    if (name === 'stratsquad_retrieve') {
      const { query, k = 5 } = (args ?? {}) as { query?: string; k?: number }
      if (!query?.trim()) throw new Error('Missing required argument: query')

      const hits = await retrieve(query, k)
      if (hits.length === 0) {
        return { content: [{ type: 'text', text: '_(检索为空：检查 SILICONFLOW_API_KEY 是否配置，以及是否跑过 npm run rag:embed)_' }] }
      }
      const text = hits.map((h, i) =>
        `[#${i + 1}] **${h.source}**${h.heading ? ` · §${h.heading}` : ''} · sim ${h.score.toFixed(3)}\n\n${h.text}`
      ).join('\n\n---\n\n')
      return { content: [{ type: 'text', text }] }
    }

    throw new Error(`Unknown tool: ${name}`)
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('StratSquad MCP server ready on stdio')  // log to stderr; stdout is the MCP wire
}

main().catch(err => { console.error(err); process.exit(1) })
