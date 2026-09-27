import { expect, test } from "bun:test";
import type { OrbitPose } from "../src/frame-input.ts";
import { orbitEye } from "../src/camera.ts";
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

test("with bounds, the target and the eye stay inside the box from every side", () => {
  const bounds = [-9, 0.3, -5, 9, 5, 11] as const;
  const orbit = new OrbitController(
    { target: [0, 1.4, 0], yaw: 0, pitch: 0.2, distance: 8, fovY: 0.6 },
    { ...DEFAULT_ORBIT_LIMITS, bounds: [...bounds] },
  );
  const eye: [number, number, number] = [0, 0, 0];
  const inside = () => {
    orbitEye(orbit.goal, eye);
    for (let i = 0; i < 3; i++) {
      expect(eye[i]!).toBeGreaterThanOrEqual(bounds[i]! - 1e-6);
      expect(eye[i]!).toBeLessThanOrEqual(bounds[i + 3]! + 1e-6);
    }
  };
  // Facing the room from the front: nothing to clamp.
  expect(orbit.goal.distance).toBeCloseTo(8, 6);
  // Swing round to face the window: the back wall is 5 m behind, so the eye comes in.
  orbit.pointerDown({ pointerId: 1, x: 0, y: 0, button: 0 });
  for (let x = 0; x <= 600; x += 20) {
    orbit.pointerMove({ pointerId: 1, x, y: 0, button: 0 });
    inside();
  }
  expect(orbit.goal.distance).toBeLessThan(8);
  // Swinging back to the front restores the distance asked for.
  for (let x = 600; x >= 0; x -= 20) orbit.pointerMove({ pointerId: 1, x, y: 0, button: 0 });
  expect(orbit.goal.distance).toBeCloseTo(8, 6);
  // Panning far away drags the target only to the wall.
  orbit.pointerUp({ pointerId: 1, x: 0, y: 0, button: 0 });
  orbit.pointerDown({ pointerId: 2, x: 0, y: 0, button: 2 });
  orbit.pointerMove({ pointerId: 2, x: 100_000, y: 0, button: 2 });
  inside();
  for (let i = 0; i < 3; i++) {
    expect(orbit.goal.target[i]!).toBeGreaterThanOrEqual(bounds[i]!);
    expect(orbit.goal.target[i]!).toBeLessThanOrEqual(bounds[i + 3]!);
  }
  // The eased pose stays in too.
  for (let i = 0; i < 20; i++) {
    orbitEye(orbit.update(1 / 60), eye);
    for (let j = 0; j < 3; j++) expect(eye[j]!).toBeLessThanOrEqual(bounds[j + 3]! + 1e-6);
  }
});
