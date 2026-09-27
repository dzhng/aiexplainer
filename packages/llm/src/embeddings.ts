// Nearest neighbours in a model's input embedding table (chapter 2's pins).
import type { Transformer } from "./transformer.ts";

export interface Neighbour {
  token: number;
  /** Cosine similarity to the query token's embedding. */
  similarity: number;
}

/** The `k` tokens whose embeddings point most nearly the same way as `token`'s. */
export function nearestTokens(model: Transformer, token: number, k: number): Neighbour[] {
  const { dModel: d, vocab } = model.arch;
  if (!(token >= 0 && token < vocab))
    throw new Error(`token id ${token} is outside the vocabulary`);
  const emb = model.tokEmb;
  const norm = (row: number) => {
    let sum = 0;
    for (let i = 0; i < d; i++) sum += emb[row * d + i]! ** 2;
    return Math.sqrt(sum);
  };
  const queryNorm = norm(token);
  const scored: Neighbour[] = [];
  for (let other = 0; other < vocab; other++) {
    if (other === token) continue;
    let dot = 0;
    for (let i = 0; i < d; i++) dot += emb[token * d + i]! * emb[other * d + i]!;
    scored.push({ token: other, similarity: dot / (queryNorm * norm(other) || 1) });
  }
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}
