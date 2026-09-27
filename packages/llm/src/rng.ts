// Seeded randomness: the one source of random numbers, injected everywhere so every
// run is reproducible. Wraps pmndrs `math/random` (mulberry32).
import { mulberry32 } from "math/random";

export type Rng = () => number;

/** A generator of floats in [0, 1), fully determined by `seed`. */
export function seededRng(seed: number): Rng {
  const state = mulberry32.create(seed);
  return () => mulberry32.sample(state);
}
