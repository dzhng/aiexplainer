// Turning logits into a choice: temperature, a numerically stable softmax, and a draw.
import type { Rng } from "./rng.ts";

/** The index of the largest value (the first, on ties). */
export function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

/**
 * `softmax(logits / temperature)`, computed after subtracting the max so large logits
 * cannot overflow. Temperature 0 puts all probability on the argmax (first on ties).
 */
export function probabilities(logits: ArrayLike<number>, temperature: number): Float64Array {
  if (!(temperature >= 0)) throw new Error(`temperature must be ≥ 0, got ${temperature}`);
  const probs = new Float64Array(logits.length);
  const best = argmax(logits);
  if (temperature === 0) {
    probs[best] = 1;
    return probs;
  }
  const max = logits[best]!;
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    sum += probs[i] = Math.exp((logits[i]! - max) / temperature);
  }
  for (let i = 0; i < probs.length; i++) probs[i]! /= sum;
  return probs;
}

/** Draws an index with probability `probs[i]`, using one number from `rng`. */
export function sample(probs: ArrayLike<number>, rng: Rng): number {
  const target = rng();
  let cumulative = 0;
  let last = 0;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i]! <= 0) continue;
    cumulative += probs[i]!;
    last = i;
    if (target < cumulative) return i;
  }
  return last; // rounding left the cumulative sum just under 1
}
