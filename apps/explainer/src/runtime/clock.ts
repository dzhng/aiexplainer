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

/** Whether `search` holds the clock (`?clock=held`); decorative motion is skipped then. */
export function clockIsHeld(search: string): boolean {
  return new URLSearchParams(search).get("clock") === "held";
}

/** `?clock=held&t=12.5` holds time; anything else runs in real time. */
export function clockFromSearch(search: string): Clock {
  if (!clockIsHeld(search)) return rafClock();
  return heldClock(Number(new URLSearchParams(search).get("t") ?? 0));
}
