/** The chapter ladder. A chapter's display number is its index here (D31); code uses slugs. */
export const LADDER = [
  "autocomplete",
  "tokenizer",
  "embeddings",
  "sampling",
  "attention",
  "positions",
  "mlp",
  "residual",
  "stack",
  "generation",
  "kv-cache",
  "batching",
  "quantization",
  "speculative",
  "experts",
  "finished",
] as const;

export type ChapterSlug = (typeof LADDER)[number];

export function displayNumber(slug: ChapterSlug): number {
  return LADDER.indexOf(slug);
}

export function slugAt(display: number): ChapterSlug | undefined {
  return LADDER[display];
}
