import { expect, test } from "bun:test";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import type { Timeline } from "../src/chapters/types.ts";

const loop: Timeline = {
  durationSec: 20,
  channels: {
    ramp: [
      { t: 2, v: 1 },
      { t: 10, v: 5, ease: "inOut" },
      { t: 15, v: 3 },
    ],
    held: [
      { t: 0, v: 0, ease: "step" },
      { t: 8, v: 7, ease: "step" },
    ],
  },
  beats: [
    { t: 4, id: "a", note: "" },
    { t: 12, id: "b", note: "" },
  ],
};

const at = (t: number) => {
  const s = evalTimeline(loop, t, createTimelineState(loop));
  return { ...s, channels: { ...s.channels } as { ramp: number; held: number } };
};

test("the loop wrap is continuous: t=0 and t=duration agree, and the approach to the wrap meets t=0", () => {
  expect(at(20)).toEqual(at(0));
  expect(at(20 - 1e-9).channels.ramp).toBeCloseTo(at(0).channels.ramp, 6);
  expect(at(-5)).toEqual(at(15));
});

test("the segment after the last keyframe interpolates into the first keyframe of the next pass", () => {
  // ramp: 3 at t=15 → 1 at t=2+20, linear; halfway is t=18.5.
  expect(at(18.5).channels.ramp).toBeCloseTo(2, 9);
  expect(at(0).channels.ramp).toBeCloseTo(3 + (1 - 3) * (5 / 7), 9);
});

test("step easing holds the previous value until its keyframe", () => {
  expect(at(7.999).channels.held).toBe(0);
  expect(at(8).channels.held).toBe(7);
  expect(at(19.999).channels.held).toBe(7);
  expect(at(0).channels.held).toBe(0);
});

test("inOut easing is symmetric and pinned at the ends", () => {
  expect(at(2).channels.ramp).toBe(1);
  expect(at(6).channels.ramp).toBeCloseTo(3, 9);
  expect(at(10).channels.ramp).toBe(5);
  expect(at(4).channels.ramp - 1).toBeCloseTo(5 - at(8).channels.ramp, 9);
});

test("the active beat is the latest one at or before t, wrapping before the first", () => {
  expect(at(4).beat).toBe(0);
  expect(at(11.9).beat).toBe(0);
  expect(at(12).beat).toBe(1);
  expect(at(1).beat).toBe(1);
});

test("evalTimeline writes into the state it is given", () => {
  const state = createTimelineState(loop);
  const channels = state.channels;
  expect(evalTimeline(loop, 9, state)).toBe(state);
  expect(state.channels).toBe(channels);
});
