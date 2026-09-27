/**
 * The HUD's game-feel motion (slice 04b): panels slide in on chapter arrival and the stat chips
 * count up to their value. Both are decoration only. They run just when the HUD is told motion
 * is allowed (a live clock) and the reader has not asked for reduced motion, so a held clock
 * always shows the settled HUD and the exact numbers. Timing comes from `requestAnimationFrame`
 * and the Web Animations API, never the wall clock (`runtime/clock.ts` owns that).
 */
import { useLayoutEffect, useState, type RefObject } from "react";
import { formatStat } from "../chapters/format.ts";
import type { StatFormat } from "../chapters/types.ts";

/** Panel slide-in and chip count-up length (the slice caps HUD motion at 400 ms). */
export const INTRO_MS = 360;
export const COUNT_MS = 400;
/** Each later panel starts this much after the one before it. */
const STAGGER_MS = 40;
const SLIDE_PX = 24;
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Where a `data-intro` panel slides in from. */
export type IntroFrom = "left" | "right" | "below";
const FROM: Record<IntroFrom, string> = {
  left: `${-SLIDE_PX}px 0`,
  right: `${SLIDE_PX}px 0`,
  below: `0 ${SLIDE_PX}px`,
};

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Plays the arrival intro on every `[data-intro]` panel under `root` whenever `arrival` changes
 * (and on mount). `arrival` is the HUD's arrival hook: today the chapter's loop epoch; the 11c
 * camera move can pass its own start instead. Animates `translate` and `opacity` only, so a
 * panel's own `transform` (the centred ladder) and cut-corner `clip-path` are untouched.
 */
export function useArrivalIntro(
  root: RefObject<HTMLElement | null>,
  arrival: number,
  motion: boolean,
): void {
  useLayoutEffect(() => {
    if (!motion || !root.current) return;
    const panels = root.current.querySelectorAll<HTMLElement>("[data-intro]");
    const running = [...panels].map((panel, i) =>
      panel.animate(
        [
          { opacity: 0, translate: FROM[panel.dataset.intro as IntroFrom] },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: INTRO_MS, delay: i * STAGGER_MS, easing: EASE_OUT, fill: "backwards" },
      ),
    );
    return () => running.forEach((a) => a.cancel());
  }, [root, arrival, motion]);
}

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

/**
 * A chip's text `p` of the way through its count-up (0–1): the value scaled by an ease-out,
 * written by the chip's own formatter. From `p = 1` on it is exactly `formatStat(value)`, the
 * text the chip shows when settled.
 */
export function countUpText(value: number, format: StatFormat, p: number): string {
  return formatStat(p >= 1 ? value : value * easeOutCubic(Math.max(0, p)), format);
}

/**
 * The text a stat chip shows: `settled` once the count-up is done. With a `countKey` (motion
 * allowed) and a `value`, it counts up from zero over `COUNT_MS` whenever the key or the value
 * changes; with `countKey` null it is always `settled`.
 */
export function useCountUp(
  value: number | null,
  format: StatFormat,
  settled: string,
  countKey: number | null,
): string {
  const [text, setText] = useState(settled);
  useLayoutEffect(() => {
    if (countKey === null || value === null) {
      setText(settled);
      return;
    }
    let start: number | undefined;
    let frame = 0;
    const tick = (now: number) => {
      start ??= now;
      const p = (now - start) / COUNT_MS;
      setText(p >= 1 ? settled : countUpText(value, format, p));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setText(countUpText(value, format, 0));
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, format, settled, countKey]);
  return text;
}
