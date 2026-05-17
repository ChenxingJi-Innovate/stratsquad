// Thin proxy: forward POST /api/run to the Python LangGraph backend, stream SSE back.
// Backend URL comes from PYTHON_BACKEND_URL env var. Defaults to localhost for dev.
//
// The frontend's SSE parsing is unchanged — Python emits the same StreamEvent shape
// the Node pipeline used to emit (agent_token / plan / rag_hits / trend_result / ...).

export const runtime = 'nodejs'
export const maxDuration = 300

const BACKEND = process.env.PYTHON_BACKEND_URL ?? 'http://127.0.0.1:8000'

export async function POST(req: Request): Promise<Response> {
  const body = await req.text()
  try {
    const upstream = await fetch(`${BACKEND}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    })
    if (!upstream.ok || !upstream.body) {
      const err = await upstream.text().catch(() => '')
      return new Response(`backend ${upstream.status}: ${err}`, { status: upstream.status || 502 })
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e: any) {
    return new Response(`backend unreachable: ${e?.message ?? e}`, { status: 502 })
  }
}
