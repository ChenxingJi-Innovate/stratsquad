// Proxy to Python /api/qa — streams the ReAct agent's reasoning + tool calls back.

export const runtime = 'nodejs'
export const maxDuration = 300

const BACKEND = process.env.PYTHON_BACKEND_URL ?? 'http://127.0.0.1:8000'

export async function POST(req: Request): Promise<Response> {
  const body = await req.text()
  try {
    const upstream = await fetch(`${BACKEND}/api/qa`, {
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
