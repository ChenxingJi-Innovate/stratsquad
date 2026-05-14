import type { Chunk } from './types'

// Tunable. CJK is char-dense so a 400-char chunk is roughly equivalent to
// 200-300 English tokens — fits BGE-M3's optimal range and leaves room
// for top-k stacking in a single LLM call.
const TARGET = 420
const OVERLAP = 60
const MAX = 600  // hard cap; anything bigger gets split mid-sentence

// Split a single CJK-friendly text into roughly TARGET-sized chunks at clean boundaries.
// Boundary preference (descending): \n\n  >  。！？  >  ，；  >  any char.
function splitToChunks(text: string): string[] {
  const out: string[] = []
  let cursor = 0
  const len = text.length

  while (cursor < len) {
    const remaining = len - cursor
    if (remaining <= MAX) {
      out.push(text.slice(cursor))
      break
    }

    // Look for the best boundary in [cursor + TARGET, cursor + MAX].
    const windowStart = cursor + TARGET
    const windowEnd = Math.min(cursor + MAX, len)
    const window = text.slice(windowStart, windowEnd)

    let cut = -1
    // Prefer paragraph break.
    const para = window.indexOf('\n\n')
    if (para >= 0) cut = para + 2
    // Then sentence-end punct.
    if (cut < 0) {
      const m = window.match(/[。！？!?]/)
      if (m && m.index !== undefined) cut = m.index + 1
    }
    // Then comma / semicolon.
    if (cut < 0) {
      const m = window.match(/[，；,;]/)
      if (m && m.index !== undefined) cut = m.index + 1
    }
    // Hard cut if no boundary found.
    if (cut < 0) cut = window.length

    const end = windowStart + cut
    out.push(text.slice(cursor, end))
    // Step forward, leaving OVERLAP chars to preserve context across chunks.
    cursor = Math.max(end - OVERLAP, cursor + 1)
  }

  return out.map(s => s.trim()).filter(s => s.length >= 40)
}

// Parse a markdown file and produce labeled chunks. We track the nearest preceding ## heading
// so the UI can show "from §市场画像 in sea-mobile-2025.md" instead of just a chunk id.
export function chunkMarkdown(source: string, raw: string): Chunk[] {
  // Split text at headings while remembering them.
  const lines = raw.split('\n')
  const sections: { heading?: string; text: string; offset: number }[] = []
  let currentHeading: string | undefined
  let currentBody: string[] = []
  let currentOffset = 0
  let runningOffset = 0
  let sectionStartOffset = 0

  const flush = () => {
    const body = currentBody.join('\n').trim()
    if (body.length > 0) {
      sections.push({ heading: currentHeading, text: body, offset: sectionStartOffset })
    }
    currentBody = []
  }

  for (const line of lines) {
    const lineLen = line.length + 1  // +1 for the \n we split on
    if (/^##\s+/.test(line)) {
      flush()
      currentHeading = line.replace(/^##\s+/, '').trim()
      sectionStartOffset = runningOffset + lineLen
    } else if (/^#\s+/.test(line)) {
      // top-level # heading: treat as doc title, skip from body but remember not as section header
      flush()
      currentHeading = undefined
      sectionStartOffset = runningOffset + lineLen
    } else {
      if (currentBody.length === 0) sectionStartOffset = runningOffset
      currentBody.push(line)
    }
    runningOffset += lineLen
  }
  flush()

  const chunks: Chunk[] = []
  let idx = 0
  for (const sec of sections) {
    const parts = splitToChunks(sec.text)
    let partOffset = sec.offset
    for (const part of parts) {
      // Find where this part starts within sec.text to compute absolute offset.
      const localStart = sec.text.indexOf(part)
      const absStart = localStart >= 0 ? sec.offset + localStart : partOffset
      const absEnd = absStart + part.length
      chunks.push({
        id: `${source}#${idx}`,
        source,
        heading: sec.heading,
        text: part,
        startChar: absStart,
        endChar: absEnd,
      })
      idx += 1
      partOffset = absEnd
    }
  }
  return chunks
}
