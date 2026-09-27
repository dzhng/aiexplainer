/**
 * Every written chapter, keyed by slug and validated at load time. Chapters not yet
 * written are absent; the ladder (`ladder.ts`) still numbers them.
 */
import { autocomplete } from "./data/autocomplete.ts";
import { tokenizer } from "./data/tokenizer.ts";
import { mlp } from "./data/mlp.ts";
import { residual } from "./data/residual.ts";
import { stack } from "./data/stack.ts";
import type { ChapterSlug } from "./ladder.ts";
import type { ChapterDef } from "./types.ts";
import { validateChapter } from "./validate.ts";

export const CHAPTERS: Partial<Record<ChapterSlug, ChapterDef>> = {
  autocomplete,
  tokenizer,
  mlp,
  residual,
  stack,
};

for (const [slug, def] of Object.entries(CHAPTERS)) {
  if (def.slug !== slug)
    throw new Error(`chapter registered as ${slug} but its slug is ${def.slug}`);
  const problems = validateChapter(def);
  if (problems.length) throw new Error(`chapter ${slug} is invalid:\n  ${problems.join("\n  ")}`);
}
