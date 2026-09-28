/**
 * The arrival move (D42): on arriving at a chapter the camera starts on the `room-wide` shot
 * and eases in to the chapter's hero shot, so the reader sees the room first. The stage
 * (`stage.ts`) drives it: any orbit input cancels it, and the loop clock starts when it ends.
 */
import type { OrbitPose } from "@repo/renderer";

/** How long the arrival move takes, seconds (part of the ladder's skim time, D21). */
export const ARRIVAL_SEC = 2.5;

/** Ease in and out (smoothstep): at rest at both ends, without a long stall at the start. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The camera `t` (0–1, eased here) of the way from `from` to `to`, written into `out`. */
export function arrivalPose(from: OrbitPose, to: OrbitPose, t: number, out: OrbitPose): OrbitPose {
  const k = easeInOut(t);
  for (let i = 0; i < 3; i++) out.target[i] = lerp(from.target[i]!, to.target[i]!, k);
  // The short way round.
  const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  out.yaw = from.yaw + turn * k;
  out.pitch = lerp(from.pitch, to.pitch, k);
  // Distance eases in log space, so the pull-in feels even from far to near.
  out.distance = Math.exp(lerp(Math.log(from.distance), Math.log(to.distance), k));
  out.fovY = lerp(from.fovY, to.fovY, k);
  return out;
}

/** One move in progress: where it goes, from where, and when it started (clock seconds). */
export class Arrival {
  #pose: OrbitPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1, fovY: 1 };
  #start: number | null = null;
  #done = false;

  constructor(
    readonly from: OrbitPose,
    readonly to: OrbitPose,
    readonly durationSec: number,
  ) {}

  /** Whether the move is over (finished or cancelled). */
  get done(): boolean {
    return this.#done;
  }

  /** The pose at clock time `now` (the first call starts the move); `null` once done. */
  at(now: number): OrbitPose | null {
    if (this.#done) return null;
    this.#start ??= now;
    const t = (now - this.#start) / this.durationSec;
    if (t >= 1) this.#done = true;
    return arrivalPose(this.from, this.to, t, this.#pose);
  }

  /** The reader took the camera: stop where it is. */
  cancel(): void {
    this.#done = true;
  }
}
