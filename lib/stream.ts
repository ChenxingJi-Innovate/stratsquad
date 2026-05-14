import type { StreamEvent } from './types'

// Build a TransformStream-like writer over a ReadableStream controller.
// Each emit() sends one SSE `data:` line so the browser EventSource (or fetch reader) can parse incrementally.
export class SSEWriter {
  private encoder = new TextEncoder()
  constructor(private controller: ReadableStreamDefaultController<Uint8Array>) {}

  emit(event: StreamEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`
    this.controller.enqueue(this.encoder.encode(payload))
  }

  close() {
    try {
      this.controller.close()
    } catch {
      // controller may already be closed if client aborted
    }
  }
}

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering on Vercel/proxies
  }
}
