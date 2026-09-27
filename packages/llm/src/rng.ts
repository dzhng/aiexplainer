// Seeded randomness (mulberry32): the one source of random numbers, injected everywhere
// so every run is reproducible.
export type Rng = () => number;

/** A generator of floats in [0, 1), fully determined by `seed`. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
