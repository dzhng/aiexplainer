// Greedy continuation: the model's own top pick, one token per forward pass, reusing the
// KV cache. Chapter 12 runs it on `full` and `full-q8` to show both machines agree.
import { createKvCache, forward } from "./forward.ts";
import { probabilities } from "./sample.ts";
import { promptTokens } from "./tokenizer.ts";
import type { Transformer } from "./transformer.ts";

export interface Continuation {
  /** The chosen token ids, in order (it stops early after end-of-story or at the context). */
  tokens: number[];
  /** The probability the model gave each chosen token. */
  p: number[];
}

/** Up to `count` greedy tokens after `prompt` (which must be non-empty). */
export function greedyContinue(model: Transformer, prompt: number[], count: number): Continuation {
  if (prompt.length === 0) throw new Error("greedyContinue needs a prompt");
  const eos = model.tokenizer.special.eos;
  const kv = createKvCache(model);
  const out: Continuation = { tokens: [], p: [] };
  let logits = forward(model, prompt, { kv }).logits;
  while (out.tokens.length < count) {
    const probs = probabilities(logits, 1);
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i]! > probs[best]!) best = i;
    out.tokens.push(best);
    out.p.push(probs[best]!);
    if (best === eos || kv.length + 1 >= model.arch.ctx) break;
    logits = forward(model, [best], { kv }).logits;
  }
  return out;
}

/** A greedy continuation of text, token by token, with each token's text and probability. */
export interface TextContinuation {
  tokens: { id: number; text: string; p: number }[];
}

/** Up to `count` greedy tokens after `text` (prefixed with the start-of-story token). */
export function continueText(model: Transformer, text: string, count: number): TextContinuation {
  const { tokens, p } = greedyContinue(model, promptTokens(model.tokenizer, text), count);
  return {
    tokens: tokens.map((id, i) => ({ id, text: model.tokenizer.decode([id]), p: p[i]! })),
  };
}
