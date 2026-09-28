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

/** Real time, starting at 0 when created. */
function rafClock(): Clock {
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

/**
 * Whether the harness holds time (`?clock=held`): decorative motion on the wall clock is
 * skipped then, so captures are deterministic.
 */
export function clockIsHeld(search: string): boolean {
  return new URLSearchParams(search).get("clock") === "held";
}

/**
 * Whether chapters open with the arrival move (D42): in real time yes; under a held clock
 * (held captures) only with `?arrival=1`, so hero shots stay deterministic.
 */
export function arrivalFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("arrival") === "1" || !clockIsHeld(search);
}

/** `?clock=held&t=12.5` holds time; anything else runs in real time. */
export function clockFromSearch(search: string): Clock {
  const params = new URLSearchParams(search);
  return params.get("clock") === "held" ? heldClock(Number(params.get("t") ?? 0)) : rafClock();
}
