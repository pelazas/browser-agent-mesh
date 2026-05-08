import { embed } from '../engine';

export interface ChunkWithEmbedding {
  text: string;
  embedding: number[];
}

export async function embedDocuments(documents: string[]): Promise<ChunkWithEmbedding[]> {
  const embeddings = await embed(documents);
  return documents.map((text, i) => ({
    text,
    embedding: embeddings[i] ?? [],
  }));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function topKSimilar(
  query: number[],
  candidates: ChunkWithEmbedding[],
  k: number = 5,
): ChunkWithEmbedding[] {
  const scored = candidates.map((c) => ({
    ...c,
    score: cosineSimilarity(query, c.embedding),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
