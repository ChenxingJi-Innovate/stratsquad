import { ds, MODEL, safeParseJSON } from '../deepseek'
import type { AgentName } from '../types'
import type { EventSink } from '../stream'

// Streamed chat completion. Emits agent_start at the top, agent_token per delta, agent_done at the end.
// Returns the full assistant content for the orchestrator to chain into the next agent.
export async function runStreamed(opts: {
  agent: AgentName
  prompt: string
  sse: EventSink
  maxTokens?: number
  json?: boolean
  system?: string
}): Promise<string> {
  const { agent, prompt, sse, maxTokens = 2000, json = false, system } = opts
  sse.emit({ type: 'agent_start', agent })

  const messages: { role: 'system' | 'user'; content: string }[] = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt })

  const stream = await ds.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    response_format: json ? { type: 'json_object' } : undefined,
    messages,
    stream: true,
  })

  let buffer = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? ''
    if (delta) {
      buffer += delta
      sse.emit({ type: 'agent_token', agent, delta })
    }
  }
  sse.emit({ type: 'agent_done', agent, content: buffer })
  return buffer
}

// Same as runStreamed but parses JSON at the end and returns the parsed object.
export async function runJSON<T = any>(opts: Parameters<typeof runStreamed>[0]): Promise<T> {
  const text = await runStreamed({ ...opts, json: true })
  return safeParseJSON<T>(text)
}
