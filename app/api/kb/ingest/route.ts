// Knowledge-base ingest endpoint. Takes raw text (or fetches a URL) and streams
// chunking + embedding progress back as SSE. Returns the embedded chunks at the end
// so the client can persist them in browser state and ship them back on /api/run.
//
// Stateless: server never holds onto user chunks across requests. The client owns them.

import { SSEWriter, sseHeaders } from '../../../../lib/stream'
import { chunkMarkdown } from '../../../../lib/rag/chunk'
import { embedBatched } from '../../../../lib/rag/embed'
import type { UserChunk } from '../../../../lib/rag/types'
import type { StreamEvent } from '../../../../lib/types'

export const runtime = 'nodejs'
export const maxDuration = 120

type IngestPayload = { name: string; text?: string; url?: string }

// Best-effort HTML → text. We don't pull in a real DOM parser; for prototype use this
// regex-based stripper is fine for most blog / wiki / news pages.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fetchUrlText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ctype = res.headers.get('content-type') ?? ''
  const raw = await res.text()
  if (ctype.includes('html') || raw.trimStart().startsWith('<')) return stripHtml(raw)
  return raw
}

export async function POST(req: Request) {
  const body = (await req.json()) as IngestPayload
  if (!body.name) return new Response('Missing name', { status: 400 })
  if (!body.text && !body.url) return new Response('Provide text or url', { status: 400 })
  if (!process.env.SILICONFLOW_API_KEY) {
    return new Response('SILICONFLOW_API_KEY required for embedding', { status: 500 })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sse = new SSEWriter(controller)
      const emit = (ev: any) => sse.emit(ev as StreamEvent)
      try {
        // 1. Resolve text source.
        let text = body.text ?? ''
        if (body.url) {
          emit({ type: 'chunking', size: 0 })
          text = await fetchUrlText(body.url)
        }
        emit({ type: 'chunking', size: text.length })

        // 2. Chunk. We reuse the same markdown chunker; for plain text it still works
        //    (no headings detected, so heading remains undefined and content stays intact).
        const chunks = chunkMarkdown(body.name, text)
        if (chunks.length === 0) {
          emit({ type: 'error', message: 'no chunks produced (text too short or empty)' })
          sse.close()
          return
        }

        // 3. Embed.
        emit({ type: 'embedding' })
        const vectors = await embedBatched(chunks.map(c => c.text), 16)

        // 4. Pack into UserChunk shape.
        const docId = crypto.randomUUID().slice(0, 8)
        const userChunks: UserChunk[] = chunks.map((c, i) => ({
          id: `${docId}#${i}`,
          text: c.text,
          embedding: vectors[i],
          source: c.source,
          heading: c.heading,
        }))

        emit({ type: 'ready', chunks: userChunks })
      } catch (e: any) {
        emit({ type: 'error', message: e?.message ?? 'ingest failed' })
      } finally {
        sse.close()
      }
    },
  })

  return new Response(stream, { headers: sseHeaders() })
}
