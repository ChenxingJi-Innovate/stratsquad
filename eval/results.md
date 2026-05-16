# RAG Retrieval Evaluation

Queries: 19 · scored with cosine similarity over normalized embeddings.

| Model | dim | hit@5 | hit@10 | recall@5 | recall@10 | MRR |
|-------|----:|------:|-------:|---------:|----------:|----:|
| `BAAI/bge-m3` | 1024 | 94.7% | 94.7% | 90.4% | 92.1% | 0.860 |

## What the columns mean

- **hit@k**: fraction of queries with at least one relevant chunk in top-k. The headline number — does the retriever surface *anything* useful?
- **recall@k**: fraction of all relevant chunks actually retrieved (averaged across queries). Punishes a retriever that finds one of two relevant chunks.
- **MRR (Mean Reciprocal Rank)**: 1 / (rank of first relevant chunk), averaged. Higher means relevant content shows up at the very top.

## How to add another model

```bash
EMBED_MODEL=BAAI/bge-large-zh-v1.5 npx tsx scripts/embed.ts --out=data/embeddings-bge-large.json
EMBED_MODEL=BAAI/bge-large-zh-v1.5 npm run rag:eval
```

Generated: 2026-05-16T22:30:01.047Z
