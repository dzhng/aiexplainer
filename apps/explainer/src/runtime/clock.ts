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

/**
 * `?clock=held&t=12.5` holds time; `?clock=step&fps=30` advances one frame per probe `step()`
 * (the recorder); anything else runs in real time.
 */
export function clockFromSearch(search: string): Clock {
  const params = new URLSearchParams(search);
  switch (params.get("clock")) {
    case "held":
      return heldClock(Number(params.get("t") ?? 0));
    case "step":
      return stepClock(Number(params.get("fps") ?? 30));
    default:
      return rafClock();
  }
}
