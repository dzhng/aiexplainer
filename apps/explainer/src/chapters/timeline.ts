/**
 * Evaluates a chapter loop at a time. The loop is cyclic: time wraps at `durationSec`, and
 * the segment after the last keyframe runs into the first keyframe of the next pass, so the
 * wrap never jumps unless a `step` keyframe asks it to.
 */
import type { ChannelId, Ease, Keyframe, Timeline } from "./types.ts";

export interface TimelineState {
  /** Loop time in [0, durationSec). */
  t: number;
  /** Index of the latest beat at or before `t`; wraps to the last beat before the first one. -1 if none. */
  beat: number;
  channels: Record<ChannelId, number>;
}

export function createTimelineState(tl: Timeline): TimelineState {
  const channels: Record<ChannelId, number> = {};
  for (const id in tl.channels) channels[id] = 0;
  return { t: 0, beat: -1, channels };
}

function ease(kind: Ease | undefined, u: number): number {
  switch (kind) {
    case "step":
      return 0;
    case "inOut":
      return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    default:
      return u;
  }
}

function channelAt(keys: Keyframe[], t: number, duration: number): number {
  const last = keys.length - 1;
  if (last === 0) return keys[0]!.v;
  let i = last;
  while (i >= 0 && keys[i]!.t > t) i--;
  // i === -1 or i === last: the wrap segment from the last keyframe to the first one.
  const from = keys[i === -1 ? last : i]!;
  const to = keys[i === last || i === -1 ? 0 : i + 1]!;
  const fromT = i === -1 ? from.t - duration : from.t;
  const toT = i === last ? to.t + duration : to.t;
  const u = (t - fromT) / (toT - fromT);
  return from.v + (to.v - from.v) * ease(to.ease, u);
}

/** Writes the loop's state at time `t` (seconds, any value) into `out`. Allocates nothing. */
export function evalTimeline(tl: Timeline, t: number, out: TimelineState): TimelineState {
  const d = tl.durationSec;
  const wrapped = ((t % d) + d) % d;
  out.t = wrapped;
  for (const id in tl.channels) out.channels[id] = channelAt(tl.channels[id]!, wrapped, d);
  let beat = tl.beats.length - 1;
  while (beat >= 0 && tl.beats[beat]!.t > wrapped) beat--;
  out.beat = beat === -1 ? tl.beats.length - 1 : beat;
  return out;
}
