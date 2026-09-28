// The generation loop (chapter 9): predict one token, append it, and run again. A generator,
// so its consumer controls the pace and can stop at any step (the worker yields between
// steps, which is what makes a long generation cancellable). Seeded through `rng`.
import { forward } from "./forward.ts";
import { createKvCache } from "./kvcache.ts";
import type { Rng } from "./rng.ts";
import { probabilities, sample } from "./sample.ts";
import type { Transformer } from "./transformer.ts";

export interface GenerateOptions {
  maxNewTokens: number;
  /** 0 is greedy. */
  temperature: number;
  rng: Rng;
  /**
   * With a KV cache (the default), each step feeds only the newest token; without one, each
   * step rereads the whole text so far (chapter 9's loop, before chapter 10 fixes it).
   */
  cache?: boolean;
  /** Sliding window: each position sees at most this many positions (chapter 10). */
  window?: number;
}

export interface GenerateStep {
  token: number;
  /** Tokens this step fed through the model: its work. */
  fed: number;
  /** The token's probability when it was drawn. */
  p: number;
}

/**
 * Yields one step per generated token, stopping after `maxNewTokens`, at `<eos>` (which is
 * yielded, then ends the loop) or when the text fills the model's context.
 */
export function* generate(
  model: Transformer,
  prompt: number[],
  options: GenerateOptions,
): Generator<GenerateStep, void, undefined> {
  if (prompt.length === 0) throw new Error("generate needs a prompt");
  const { ctx } = model.arch;
  const eos = model.tokenizer.special.eos;
  // With a window, the cache keeps only the last `window` positions: older notes are
  // overwritten (forward feeds a longer prompt in pieces).
  const capacity = options.window ? Math.min(ctx, options.window) : ctx;
  const kv = options.cache === false ? undefined : createKvCache(model, capacity);
  const tokens = [...prompt];
  for (let made = 0; made < options.maxNewTokens && tokens.length < ctx; made++) {
    const input = kv ? tokens.slice(kv.length) : tokens;
    const fed = input.length;
    const { logits } = forward(model, input, { kv, window: options.window });
    const probs = probabilities(logits, options.temperature);
    const token = sample(probs, options.rng);
    tokens.push(token);
    yield { token, fed, p: probs[token]! };
    if (token === eos) return;
  }
}
