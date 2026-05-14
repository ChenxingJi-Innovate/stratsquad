import type { StreamEvent } from './types'

// A sink agents emit progress events to. SSEWriter pushes to an HTTP stream,
// BufferSink collects in memory (used by the MCP server and offline tests).
export interface EventSink {
  emit(event: StreamEvent): void
  close?(): void
}

// Build a TransformStream-like writer over a ReadableStream controller.
// Each emit() sends one SSE `data:` line so the browser EventSource (or fetch reader) can parse incrementally.
export class SSEWriter implements EventSink {
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

// Captures every event for later inspection. Used by the MCP server to return
// the full event log alongside the final brief.
export class BufferSink implements EventSink {
  events: StreamEvent[] = []
  emit(event: StreamEvent) { this.events.push(event) }
  close() { /* no-op */ }
}

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering on Vercel/proxies
  }
}
