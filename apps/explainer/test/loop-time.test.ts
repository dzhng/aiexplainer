import { expect, test } from "bun:test";
import { LoopTime } from "../src/runtime/loop-time.ts";

test("the first epoch starts at clock time 0, so a held clock shows its own time", () => {
  expect(new LoopTime().at(5, 0, true)).toBe(5);
});

test("pausing holds loop time and resuming continues from it", () => {
  const loop = new LoopTime();
  expect(loop.at(2, 0, true)).toBe(2);
  expect(loop.at(3, 0, false)).toBe(3);
  expect(loop.at(10, 0, false)).toBe(3);
  expect(loop.at(10, 0, true)).toBe(3);
  expect(loop.at(12, 0, true)).toBe(5);
});

test("a new epoch (arriving again) restarts at 0, playing or not", () => {
  const loop = new LoopTime();
  loop.at(7, 0, true);
  expect(loop.at(9, 1, true)).toBe(0);
  expect(loop.at(11, 1, true)).toBe(2);
  expect(loop.at(20, 2, false)).toBe(0);
  expect(loop.at(25, 2, false)).toBe(0);
});
