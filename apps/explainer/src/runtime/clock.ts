/**
 * The app's only time source (spec: one injectable clock). Seconds, monotonic.
 * This is the only module allowed to read the wall clock; a test enforces it.
 */
export interface Clock {
  now(): number;
}

export interface HeldClock extends Clock {
  set(t: number): void;
}

export interface StepClock extends Clock {
  step(): void;
}

/** Real time, starting at 0 when created. */
export function rafClock(): Clock {
  const start = performance.now();
  return { now: () => (performance.now() - start) / 1000 };
}

/**
 * Real time for UI motion that keeps moving while the loop clock is held (view changes ease
 * in on a lab page with `?clock=held` too).
 */
export const motionClock: Clock = rafClock();

/** Frozen time for deterministic captures. */
export function heldClock(t: number): HeldClock {
  let held = t;
  return {
    now: () => held,
    set: (next) => {
      held = next;
    },
  };
}

/** Advances by exactly one frame per `step()`, for frame-by-frame recording. */
export function stepClock(fps: number): StepClock {
  let frame = 0;
  return {
    now: () => frame / fps,
    step: () => {
      frame += 1;
    },
  };
}

/**
 * Whether chapters open with the arrival move (D42): in real time yes; under a held clock
 * (captures, the recorder) only with `?arrival=1`, so hero shots stay deterministic.
 */
export function arrivalFromSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get("arrival") === "1" || params.get("clock") !== "held";
}

/** `?clock=held&t=12.5` holds time; anything else runs in real time. */
export function clockFromSearch(search: string): Clock {
  const params = new URLSearchParams(search);
  if (params.get("clock") !== "held") return rafClock();
  return heldClock(Number(params.get("t") ?? 0));
}
