import { expect, test } from "bun:test";
import type { OrbitPose } from "../src/frame-input.ts";
import { DEFAULT_ORBIT_LIMITS, OrbitController } from "../src/orbit.ts";

const start = (): OrbitPose => ({ target: [0, 0, 0], yaw: 0, pitch: 0.3, distance: 6, fovY: 0.8 });

function drag(orbit: OrbitController, dx: number, dy: number, button = 0) {
  orbit.pointerDown({ pointerId: 1, x: 100, y: 100, button });
  orbit.pointerMove({ pointerId: 1, x: 100 + dx, y: 100 + dy, button });
  orbit.pointerUp({ pointerId: 1, x: 100 + dx, y: 100 + dy, button });
}

test("pitch and distance never leave their limits", () => {
  const orbit = new OrbitController(start());
  drag(orbit, 0, 100_000);
  expect(orbit.goal.pitch).toBe(DEFAULT_ORBIT_LIMITS.maxPitch);
  drag(orbit, 0, -100_000);
  expect(orbit.goal.pitch).toBe(DEFAULT_ORBIT_LIMITS.minPitch);
  orbit.wheel(100_000);
  expect(orbit.goal.distance).toBe(DEFAULT_ORBIT_LIMITS.maxDistance);
  orbit.wheel(-100_000);
  expect(orbit.goal.distance).toBe(DEFAULT_ORBIT_LIMITS.minDistance);
  orbit.update(10);
  expect(orbit.pose.distance).toBeCloseTo(DEFAULT_ORBIT_LIMITS.minDistance, 6);
});

test("a pose built outside the limits is clamped on construction", () => {
  const orbit = new OrbitController({ ...start(), pitch: 3, distance: 0.1 });
  expect(orbit.pose.pitch).toBe(DEFAULT_ORBIT_LIMITS.maxPitch);
  expect(orbit.pose.distance).toBe(DEFAULT_ORBIT_LIMITS.minDistance);
});

test("damping approaches the goal smoothly and never overshoots", () => {
  const orbit = new OrbitController(start());
  drag(orbit, -100, 0);
  const goal = orbit.goal.yaw;
  expect(goal).toBeGreaterThan(0);
  let previous = orbit.pose.yaw;
  expect(previous).toBe(0);
  for (let i = 0; i < 30; i++) {
    const yaw = orbit.update(1 / 60).yaw;
    expect(yaw).toBeGreaterThan(previous);
    expect(yaw).toBeLessThanOrEqual(goal);
    previous = yaw;
  }
  expect(orbit.pose.yaw).toBeCloseTo(goal, 2);
  // A held clock (dt = 0) holds the pose.
  orbit.jumpTo(start());
  drag(orbit, -100, 0);
  expect(orbit.update(0).yaw).toBe(0);
});

test("pan moves the target in the screen plane; moves from other pointers are ignored", () => {
  const orbit = new OrbitController(start());
  drag(orbit, 50, 0, 2);
  // Yaw 0: screen right is +X, so dragging right moves the target toward −X.
  expect(orbit.goal.target[0]).toBeLessThan(0);
  expect(orbit.goal.target[1]).toBeCloseTo(0, 9);
  const before = [...orbit.goal.target];
  orbit.pointerDown({ pointerId: 1, x: 0, y: 0, button: 0 });
  orbit.pointerMove({ pointerId: 2, x: 500, y: 500, button: 0 });
  expect([...orbit.goal.target]).toEqual(before);
});
