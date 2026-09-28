import { clamp } from "math";

/**
 * The run step a scene shows: the reader's text is its only step; otherwise the loop's
 * `channel` picks one (rounded, and held to the steps there are).
 */
export function stepAt<T>(steps: readonly T[], typed: boolean, channel: number | undefined) {
  return steps[typed ? 0 : clamp(Math.round(channel ?? 0), 0, steps.length - 1)];
}
