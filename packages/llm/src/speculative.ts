// Speculative decoding (chapter 13; Leviathan et al. 2023, https://arxiv.org/abs/2211.17192;
// Chen et al. 2023, https://arxiv.org/abs/2302.01318): a small drafter guesses k tokens, the
// target checks them all in one forward pass, and each guess is kept with probability
// min(1, p/q). The output has exactly the target's distribution; the drafter only changes how
// many target passes it takes.
import { forward } from "./forward.ts";
import { createKvCache, type KvCache } from "./kvcache.ts";
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
  /**
   * The token the target added: a correction after a rejection, or a bonus after all k. `null`
   * when the kept guesses end in `<eos>`: the text is over, so the target adds nothing.
   */
  next: number | null;
}

export interface SpeculativeResult {
  /** The prompt followed by every generated token. */
  tokens: number[];
  rounds: SpeculativeRound[];
}

/**
 * The Leviathan/Chen acceptance rule for one round. `q[i]` is the drafter's distribution the
 * i-th guess was drawn from and `p[i]` the target's at the same position; `p` has one more row,
 * after the last guess. Each guess is kept with probability min(1, p/q); at the first
 * rejection the target's token is drawn from the leftover mass max(0, p − q), renormalised;
 * if every guess is kept, a bonus token is drawn from the extra row.
 */
export function verifyDrafts(
  p: ArrayLike<number>[],
  q: ArrayLike<number>[],
  drafted: number[],
  rng: Rng,
): { accepted: number; next: number } {
  for (let i = 0; i < drafted.length; i++) {
    const token = drafted[i]!;
    const pi = p[i]!;
    const qi = q[i]!;
    if (rng() < Math.min(1, pi[token]! / qi[token]!)) continue;
    const residual = Array.from(pi, (x, j) => Math.max(0, x - qi[j]!));
    const mass = residual.reduce((a, b) => a + b, 0);
    // A zero leftover mass only happens when p ≤ q everywhere, i.e. p = q; then p itself.
    const next =
      mass > 0
        ? sample(
            residual.map((r) => r / mass),
            rng,
          )
        : sample(pi, rng);
    return { accepted: i, next };
  }
  return { accepted: drafted.length, next: sample(p[drafted.length]!, rng) };
}

/** A speculative decode in progress: the committed tokens and both models' caches. */
export interface SpeculativeState {
  tokens: number[];
  /** Each holds every committed token but the last; the rest is fed on demand. */
  targetKv: KvCache;
  draftKv: KvCache;
}

export function speculativeState(
  target: Transformer,
  drafter: Transformer,
  prompt: number[],
): SpeculativeState {
  if (prompt.length === 0) throw new Error("speculative decoding needs a prompt");
  return { tokens: [...prompt], targetKv: createKvCache(target), draftKv: createKvCache(drafter) };
}

/** Tokens both models can still hold: the shorter context, less what is committed. */
function space(target: Transformer, drafter: Transformer, state: SpeculativeState): number {
  return Math.min(target.arch.ctx, drafter.arch.ctx) - state.tokens.length;
}

/**
 * One round: the drafter guesses up to `k` tokens (fewer near `room`'s end or the context's,
 * and none past its own `<eos>`), the target checks them in one pass, the kept guesses and the
 * target's own token are committed, and both caches roll back to the committed prefix. A kept
 * `<eos>` ends the text, so no token follows it. Throws if the context is already full.
 */
export function speculativeStep(
  target: Transformer,
  drafter: Transformer,
  state: SpeculativeState,
  options: Omit<SpeculativeOptions, "maxNewTokens"> & { room?: number },
): SpeculativeRound {
  const { temperature, rng } = options;
  const { tokens, targetKv, draftKv } = state;
  const free = space(target, drafter, state);
  if (free <= 0) throw new RangeError("speculative decoding: the context is full");
  const count = Math.max(0, Math.min(options.k, free - 1, options.room ?? Infinity));
  const eos = target.tokenizer.special.eos;
  const vocab = target.arch.vocab;
  const feed = (model: Transformer, kv: KvCache, extra: number[], allPositions: boolean) =>
    forward(model, [...tokens.slice(kv.length), ...extra], { kv, allPositions }).logits;

  const drafted: number[] = [];
  const q: Float64Array[] = [];
  let draftLogits = feed(drafter, draftKv, [], false);
  for (let i = 0; i < count; i++) {
    const probs = probabilities(draftLogits, temperature);
    const token = sample(probs, rng);
    drafted.push(token);
    q.push(probs);
    if (token === eos) break;
    if (i + 1 < count) draftLogits = forward(drafter, [token], { kv: draftKv }).logits;
  }

  const verify = feed(target, targetKv, drafted, true);
  const firstRow = verify.length / vocab - drafted.length - 1;
  const p = Array.from({ length: drafted.length + 1 }, (_, i) =>
    probabilities(verify.subarray((firstRow + i) * vocab, (firstRow + i + 1) * vocab), temperature),
  );
  const verdict = verifyDrafts(p, q, drafted, rng);
  const { accepted } = verdict;
  // Only the last guess can be `<eos>`; kept, it ends the text and the bonus is never drawn.
  const next = accepted > 0 && drafted[accepted - 1] === eos ? null : verdict.next;

  tokens.push(...drafted.slice(0, accepted));
  if (next !== null) tokens.push(next);
  targetKv.length = Math.min(targetKv.length, tokens.length - 1);
  draftKv.length = Math.min(draftKv.length, tokens.length - 1);
  return { drafted, accepted, next };
}

export function speculate(
  target: Transformer,
  drafter: Transformer,
  prompt: number[],
  options: SpeculativeOptions,
): SpeculativeResult {
  const eos = target.tokenizer.special.eos;
  const state = speculativeState(target, drafter, prompt);
  const rounds: SpeculativeRound[] = [];
  const generated = () => state.tokens.length - prompt.length;
  while (
    generated() < options.maxNewTokens &&
    state.tokens.at(-1) !== eos &&
    space(target, drafter, state) > 0
  ) {
    const room = options.maxNewTokens - generated() - 1;
    rounds.push(speculativeStep(target, drafter, state, { ...options, room }));
  }
  return { tokens: state.tokens, rounds };
}
