import { SSEWriter, sseHeaders } from '../../../lib/stream'
import { runOrchestrator } from '../../../lib/agents/orchestrator'
import { runCompetitor } from '../../../lib/agents/competitor'
import { runTrend } from '../../../lib/agents/trend'
import { runMarket } from '../../../lib/agents/market'
import { runRisk } from '../../../lib/agents/risk'
import { runJudge } from '../../../lib/agents/judge'
import { runComposer } from '../../../lib/agents/composer'
import { retrieve } from '../../../lib/rag/retrieve'
import { loadStore } from '../../../lib/rag/store'
import type { RagHit, SubAgent } from '../../../lib/types'

// Vercel will let this stream up to 300s on Pro / 60s on Hobby. Force Node runtime — Edge has fetch limits with the OpenAI SDK.
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const { question, corpus = '' } = await req.json()
  if (!question?.trim()) {
    return new Response('Missing question', { status: 400 })
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response('Server missing DEEPSEEK_API_KEY', { status: 500 })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sse = new SSEWriter(controller)

      try {
        // 1. Orchestrator decomposes the question into 4 sub-briefs.
        const plan = await runOrchestrator(question, corpus, sse)
        sse.emit({ type: 'plan', subtasks: plan })

        const briefOf = (a: SubAgent) => plan.find(p => p.agent === a)?.brief ?? ''

        // 2. RAG retrieval — the trend agent's brief is a sharper query than the raw user question.
        // Only run if a) the embeddings store exists and b) SiliconFlow key is configured.
        let hits: RagHit[] = []
        if (process.env.SILICONFLOW_API_KEY) {
          const store = await loadStore()
          if (store.length > 0) {
            try {
              hits = await retrieve(briefOf('trend'), 5)
              sse.emit({ type: 'rag_hits', query: briefOf('trend'), hits })
            } catch (e: any) {
              // RAG failure shouldn't kill the run — degrade to no hits.
              console.error('retrieve failed:', e?.message)
            }
          }
        }

        // 3. 4 sub-agents run in parallel — Promise.all so token streams interleave in the UI.
        const [competitor, trend, market, risk] = await Promise.all([
          runCompetitor(briefOf('competitor'), sse),
          runTrend(briefOf('trend'), hits, sse),
          runMarket(briefOf('market'), sse),
          runRisk(briefOf('risk'), sse),
        ])
        const outputs: Record<SubAgent, string> = { competitor, trend, market, risk }
        sse.emit({ type: 'subagents_done', outputs })

        // 4. Judge scores all 4 outputs on 4 rubrics.
        let scores = await runJudge(outputs, sse)
        sse.emit({ type: 'judge', scores })

        // 5. Retry any sub-agent that scored below threshold — once.
        const retryList = scores.filter(s => s.verdict === 'retry').map(s => s.agent)
        if (retryList.length > 0) {
          await Promise.all(
            retryList.map(async agent => {
              sse.emit({ type: 'retry', agent, reason: scores.find(s => s.agent === agent)?.reason ?? '' })
              const brief = briefOf(agent)
              const fresh =
                agent === 'competitor' ? await runCompetitor(brief, sse, 2) :
                agent === 'trend' ? await runTrend(brief, hits, sse, 2) :
                agent === 'market' ? await runMarket(brief, sse, 2) :
                await runRisk(brief, sse, 2)
              outputs[agent] = fresh
            })
          )
          // Re-judge after retries (single pass — we don't re-retry).
          scores = await runJudge(outputs, sse)
          sse.emit({ type: 'judge', scores })
        }

        // 6. Composer renders the final strategy brief.
        const brief = await runComposer(question, outputs, sse)
        sse.emit({ type: 'brief', markdown: brief })

        sse.emit({ type: 'complete' })
      } catch (e: any) {
        sse.emit({ type: 'error', message: e?.message ?? 'unknown error' })
      } finally {
        sse.close()
      }
    },
  })

  return new Response(stream, { headers: sseHeaders() })
}
