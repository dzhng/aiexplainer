// Speculative decoding (chapter 13; Leviathan et al. 2023, https://arxiv.org/abs/2211.17192):
// a small drafter guesses k tokens, the target checks them all in one forward pass, and
// each guess is kept with probability min(1, p/q). The output has exactly the target's
// distribution; the drafter only changes how many target passes it takes.
import { createKvCache, forward, type KvCache } from "./forward.ts";
import type { Rng } from "./rng.ts";
import { probabilities, sample } from "./sample.ts";
import type { Transformer } from "./transformer.ts";

export interface SpeculativeOptions {
  /** Tokens the drafter guesses per round. */
  k: number;
  maxNewTokens: number;
  temperature: number;
  rng: Rng;
}

export interface SpeculativeRound {
  drafted: number[];
  /** How many of `drafted` the target kept, from the front. */
  accepted: number;
  /** The token the target added: a correction after a rejection, or a bonus after all k. */
  next: number;
}

export interface SpeculativeResult {
  /** The prompt followed by every generated token. */
  tokens: number[];
  rounds: SpeculativeRound[];
}

export function speculate(
  target: Transformer,
  drafter: Transformer,
  prompt: number[],
  options: SpeculativeOptions,
): SpeculativeResult {
  const { k, temperature, rng } = options;
  if (prompt.length === 0) throw new Error("speculate needs a prompt");
  const eos = target.tokenizer.special.eos;
  const ctx = Math.min(target.arch.ctx, drafter.arch.ctx);
  const tokens = [...prompt];
  const rounds: SpeculativeRound[] = [];
  const targetKv = createKvCache(target);
  const draftKv = createKvCache(drafter);
  // Each cache holds every committed token but the last; the rest is fed on demand.
  const feed = (model: Transformer, kv: KvCache, extra: number[], allPositions: boolean) =>
    forward(model, [...tokens.slice(kv.length), ...extra], { kv, allPositions }).logits;
  const vocab = target.arch.vocab;
  const row = (logits: Float32Array, i: number) => logits.subarray(i * vocab, (i + 1) * vocab);

  while (tokens.length - prompt.length < options.maxNewTokens && tokens.at(-1) !== eos) {
    const room = Math.min(
      k,
      ctx - tokens.length - 1,
      options.maxNewTokens - (tokens.length - prompt.length) - 1,
    );
    const drafted: number[] = [];
    const draftProbs: Float64Array[] = [];
    let draftLogits = feed(drafter, draftKv, [], false);
    for (let i = 0; i < room; i++) {
      const q = probabilities(draftLogits, temperature);
      const token = sample(q, rng);
      drafted.push(token);
      draftProbs.push(q);
      if (i + 1 < room) draftLogits = forward(drafter, [token], { kv: draftKv }).logits;
    }

    const verify = feed(target, targetKv, drafted, true);
    const firstRow = verify.length / vocab - drafted.length - 1;
    let accepted = 0;
    let next = -1;
    for (; accepted < drafted.length; accepted++) {
      const p = probabilities(row(verify, firstRow + accepted), temperature);
      const q = draftProbs[accepted]!;
      const token = drafted[accepted]!;
      if (rng() < Math.min(1, p[token]! / q[token]!)) continue;
      // Rejected: draw from the leftover mass max(0, p - q), renormalised.
      const residual = p.map((pi, i) => Math.max(0, pi - q[i]!));
      const mass = residual.reduce((a, b) => a + b, 0);
      next =
        mass > 0
          ? sample(
              residual.map((r) => r / mass),
              rng,
            )
          : sample(p, rng);
      break;
    }
    if (next < 0)
      next = sample(probabilities(row(verify, firstRow + drafted.length), temperature), rng);

    tokens.push(...drafted.slice(0, accepted), next);
    rounds.push({ drafted, accepted, next });
    // Roll both caches back to the committed prefix (all tokens but the last).
    targetKv.length = Math.min(targetKv.length, tokens.length - 1);
    draftKv.length = Math.min(draftKv.length, tokens.length - 1);
    if (tokens.length >= ctx) break;
  }
  return { tokens, rounds };
}
