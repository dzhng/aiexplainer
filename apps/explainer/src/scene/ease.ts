import { clamp } from "math";

/** Smoothstep: eases in and out, at rest at both ends, so things settle rather than stop. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
