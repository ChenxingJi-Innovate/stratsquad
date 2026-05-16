import type { EventSink } from './stream'
import type { RagHit, SubAgent, TrendDataBundle } from './types'
import { runOrchestrator } from './agents/orchestrator'
import { runCompetitor } from './agents/competitor'
import { runTrend } from './agents/trend'
import { runMarket } from './agents/market'
import { runRisk } from './agents/risk'
import { runJudge } from './agents/judge'
import { runComposer } from './agents/composer'
import { retrieve } from './rag/retrieve'
import { loadStore } from './rag/store'
import { runTrendPlanner } from './trends/planner'
import { dispatchTrendQueries } from './trends/dispatch'

// Shared multi-agent pipeline. Used by both /api/run (SSE streaming) and the
// MCP server (buffer-collecting). The only difference between them is the EventSink
// the caller passes in.
export async function runPipeline(
  question: string,
  corpus: string,
  sink: EventSink,
): Promise<{
  plan: Awaited<ReturnType<typeof runOrchestrator>>
  hits: RagHit[]
  trendBundle: TrendDataBundle | null
  outputs: Record<SubAgent, string>
  scores: Awaited<ReturnType<typeof runJudge>>
  retries: SubAgent[]
  brief: string
}> {
  // 1. Orchestrator decomposes the question into 4 sub-briefs.
  const plan = await runOrchestrator(question, corpus, sink)
  sink.emit({ type: 'plan', subtasks: plan })

  const briefOf = (a: SubAgent) => plan.find(p => p.agent === a)?.brief ?? ''

  // 2. RAG retrieval (best-effort; never block the run if it fails).
  let hits: RagHit[] = []
  if (process.env.SILICONFLOW_API_KEY) {
    const store = await loadStore()
    if (store.length > 0) {
      try {
        hits = await retrieve(briefOf('trend'), 5)
        sink.emit({ type: 'rag_hits', query: briefOf('trend'), hits })
      } catch (e: any) {
        console.error('retrieve failed:', e?.message)
      }
    }
  }

  // 3. Trend data planning + dispatch (best-effort; trend agent works even with 0 results).
  let trendBundle: TrendDataBundle | null = null
  try {
    const trendPlan = await runTrendPlanner(briefOf('trend'), question, sink)
    if (trendPlan.queries.length > 0) {
      trendBundle = await dispatchTrendQueries(trendPlan, sink)
    }
  } catch (e: any) {
    console.error('trend dispatch failed:', e?.message)
  }

  // 4. 4 sub-agents run in parallel — Promise.all so token streams interleave in the UI.
  const [competitor, trend, market, risk] = await Promise.all([
    runCompetitor(briefOf('competitor'), sink),
    runTrend(briefOf('trend'), hits, trendBundle, sink),
    runMarket(briefOf('market'), sink),
    runRisk(briefOf('risk'), sink),
  ])
  const outputs: Record<SubAgent, string> = { competitor, trend, market, risk }
  sink.emit({ type: 'subagents_done', outputs })

  // 5. Judge scores all 4 outputs on 4 rubrics.
  let scores = await runJudge(outputs, sink)
  sink.emit({ type: 'judge', scores })

  // 6. Retry any sub-agent that scored below threshold — once.
  const retries: SubAgent[] = scores.filter(s => s.verdict === 'retry').map(s => s.agent)
  if (retries.length > 0) {
    await Promise.all(
      retries.map(async agent => {
        sink.emit({ type: 'retry', agent, reason: scores.find(s => s.agent === agent)?.reason ?? '' })
        const brief = briefOf(agent)
        const fresh =
          agent === 'competitor' ? await runCompetitor(brief, sink, 2) :
          agent === 'trend' ? await runTrend(brief, hits, trendBundle, sink, 2) :
          agent === 'market' ? await runMarket(brief, sink, 2) :
          await runRisk(brief, sink, 2)
        outputs[agent] = fresh
      })
    )
    // Re-judge after retries (single pass — we don't re-retry).
    scores = await runJudge(outputs, sink)
    sink.emit({ type: 'judge', scores })
  }

  // 7. Composer renders the final strategy brief.
  const brief = await runComposer(question, outputs, sink)
  sink.emit({ type: 'brief', markdown: brief })

  return { plan, hits, trendBundle, outputs, scores, retries, brief }
}
