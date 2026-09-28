/**
 * The chapter ladder. A chapter's display number is its index here (D31), and addresses use it
 * (`/#4`, `/c/4/`); code uses slugs. The first rung is the intro, which frames the job before
 * the deep dive: on screen it reads "Intro", while its address stays `/#0`.
 */
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

/** What the HUD, the fallback and the share cards call a chapter: "Intro", or its number. */
export function chapterBadge(slug: ChapterSlug): string {
  const n = displayNumber(slug);
  return n === 0 ? "Intro" : String(n);
}

/** A chapter's name in a sentence or an accessible label: "Intro", or "Chapter 4". */
export function chapterName(slug: ChapterSlug): string {
  const n = displayNumber(slug);
  return n === 0 ? "Intro" : `Chapter ${n}`;
}

export function slugAt(display: number): ChapterSlug | undefined {
  return LADDER[display];
}
