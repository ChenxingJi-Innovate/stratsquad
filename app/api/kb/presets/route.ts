// Proxy to Python /api/kb/presets — returns the manifest of available preset corpora.

export const runtime = 'nodejs'

const BACKEND = process.env.PYTHON_BACKEND_URL ?? 'http://127.0.0.1:8000'

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(`${BACKEND}/api/kb/presets`, { cache: 'no-store' })
    if (!upstream.ok) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    const body = await upstream.text()
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
