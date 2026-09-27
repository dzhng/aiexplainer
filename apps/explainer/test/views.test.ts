import { expect, test } from "bun:test";
import type { FrameView } from "@repo/renderer";
import { ViewTransition } from "../src/scene/views.ts";

const DURATION = 0.6;

test("a view eases in over the duration and starts settled in the initial view", () => {
  const view: FrameView = { mode: "whole", t: 0 };
  const views = new ViewTransition("exploded");
  views.step("exploded", 0, DURATION, view);
  expect(view).toEqual({ mode: "exploded", t: 1 });

  const fromWhole = new ViewTransition("whole");
  fromWhole.step("cutaway", 0, DURATION, view);
  expect(view).toEqual({ mode: "cutaway", t: 0 });
  fromWhole.step("cutaway", 0.3, DURATION, view);
  expect(view.t).toBeCloseTo(0.5, 6); // smoothstep(0.5)
  fromWhole.step("cutaway", 1, DURATION, view);
  expect(view.t).toBe(1);
});

test("changing between Cutaway and Exploded eases the old view out before the new one", () => {
  const view: FrameView = { mode: "whole", t: 0 };
  const views = new ViewTransition("cutaway");
  views.step("exploded", 0.3, DURATION, view);
  expect(view.mode).toBe("cutaway");
  expect(view.t).toBeCloseTo(0.5, 6);
  views.step("exploded", 0.3, DURATION, view);
  expect(view).toEqual({ mode: "exploded", t: 0 });
  views.step("exploded", 0.6, DURATION, view);
  expect(view).toEqual({ mode: "exploded", t: 1 });
  // Back to Whole: Exploded eases out, then Whole shows.
  views.step("whole", 0.6, DURATION, view);
  expect(view.mode).toBe("whole");
});
