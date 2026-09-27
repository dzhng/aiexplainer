import { expect, test } from "bun:test";
import type { OrbitPose } from "@repo/renderer";
import { Arrival, arrivalPose, easeInOut } from "../src/runtime/arrival.ts";
import { shotPose } from "../src/scene/shots.ts";

const wide = shotPose("room-wide");
const hero = shotPose("bench-close");
const out = (): OrbitPose => ({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1, fovY: 1 });

function expectPose(actual: OrbitPose, want: OrbitPose) {
  for (let i = 0; i < 3; i++) expect(actual.target[i]!).toBeCloseTo(want.target[i]!, 9);
  expect(actual.yaw).toBeCloseTo(want.yaw, 9);
  expect(actual.pitch).toBeCloseTo(want.pitch, 9);
  expect(actual.distance).toBeCloseTo(want.distance, 9);
  expect(actual.fovY).toBeCloseTo(want.fovY, 9);
}

test("arrivalPose starts exactly on room-wide and lands exactly on the hero shot", () => {
  expectPose(arrivalPose(wide, hero, 0, out()), wide);
  expectPose(arrivalPose(wide, hero, 1, out()), hero);
  // Past either end it holds.
  expectPose(arrivalPose(wide, hero, 1.4, out()), hero);
});

test("the ease starts and ends at rest, and never goes backwards", () => {
  expect(easeInOut(0)).toBe(0);
  expect(easeInOut(1)).toBe(1);
  const d = 1e-4;
  expect((easeInOut(d) - easeInOut(0)) / d).toBeLessThan(1e-3);
  expect((easeInOut(1) - easeInOut(1 - d)) / d).toBeLessThan(1e-3);
  let last = 0;
  for (let t = 0.05; t <= 1; t += 0.05) {
    expect(easeInOut(t)).toBeGreaterThanOrEqual(last);
    last = easeInOut(t);
  }
});

test("a move starts on its first frame, lands after its duration, and input cancels it", () => {
  const move = new Arrival(wide, hero, 2.5);
  expectPose(move.at(10)!, wide);
  expect(move.done).toBe(false);
  const mid = move.at(11.25)!;
  expect(mid.distance).toBeLessThan(wide.distance);
  expect(mid.distance).toBeGreaterThan(hero.distance);
  expectPose(move.at(12.5)!, hero);
  expect(move.done).toBe(true);
  expect(move.at(13)).toBeNull();

  const cancelled = new Arrival(wide, hero, 2.5);
  cancelled.at(0);
  cancelled.cancel();
  expect(cancelled.done).toBe(true);
  expect(cancelled.at(1)).toBeNull();
});
