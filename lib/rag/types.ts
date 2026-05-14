// One contiguous segment from a corpus file. id format: "<source>#<index>".
export type Chunk = {
  id: string
  source: string        // file name, e.g. "sea-mobile-2025.md"
  heading?: string      // nearest preceding ## heading, for human-readable provenance
  text: string
  startChar: number     // offset in the source file
  endChar: number
}

// Chunk + its embedding vector. Written by scripts/embed.ts, loaded at runtime.
export type EmbeddedChunk = Chunk & {
  vector: number[]      // 1024-dim for BGE-M3
  model: string         // e.g. "BAAI/bge-m3"
}

// Retrieval result surfaced to the agents and the UI.
export type RagHit = {
  id: string
  source: string
  heading?: string
  text: string
  score: number         // cosine similarity, 0..1 (assuming normalized vectors)
}
