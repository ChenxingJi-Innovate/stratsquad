import { SSEWriter, sseHeaders } from '../../../lib/stream'
import { runPipeline } from '../../../lib/pipeline'

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
        await runPipeline(question, corpus, sse)
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
