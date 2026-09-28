/**
 * Every written chapter, keyed by slug and validated at load time. Chapters not yet
 * written are absent; the ladder (`ladder.ts`) still numbers them.
 */
import { attention } from "./data/attention.ts";
import { positions } from "./data/positions.ts";
import { autocomplete } from "./data/autocomplete.ts";
import { embeddings } from "./data/embeddings.ts";
import { sampling } from "./data/sampling.ts";
import { tokenizer } from "./data/tokenizer.ts";
import { mlp } from "./data/mlp.ts";
import { generation } from "./data/generation.ts";
import { residual } from "./data/residual.ts";
import { stack } from "./data/stack.ts";
import { batching } from "./data/batching.ts";
import { quantization } from "./data/quantization.ts";
import { speculative } from "./data/speculative.ts";
import { experts } from "./data/experts.ts";
import { finished } from "./data/finished.ts";
import type { ChapterSlug } from "./ladder.ts";
import type { ChapterDef } from "./types.ts";
import { validateChapter } from "./validate.ts";

export const CHAPTERS: Partial<Record<ChapterSlug, ChapterDef>> = {
  autocomplete,
  tokenizer,
  embeddings,
  sampling,
  attention,
  positions,
  mlp,
  residual,
  stack,
  generation,
  batching,
  quantization,
  speculative,
  experts,
  finished,
};

for (const [slug, def] of Object.entries(CHAPTERS)) {
  if (def.slug !== slug)
    throw new Error(`chapter registered as ${slug} but its slug is ${def.slug}`);
  const problems = validateChapter(def);
  if (problems.length) throw new Error(`chapter ${slug} is invalid:\n  ${problems.join("\n  ")}`);
}
