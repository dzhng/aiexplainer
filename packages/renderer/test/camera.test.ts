import { expect, test } from "bun:test";
import type { Mat4, Vec3 } from "math";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  cameraMatrices,
  createCameraMatrices,
  createProjected,
  orbitEye,
  project,
} from "../src/camera.ts";
import type { OrbitPose } from "../src/frame-input.ts";
import { FRAME_UNIFORM_BYTES, packFrame } from "../src/pack.ts";

const A = CAMERA_NEAR / (CAMERA_FAR - CAMERA_NEAR);
const B = (CAMERA_FAR * CAMERA_NEAR) / (CAMERA_FAR - CAMERA_NEAR);

function expectMat(actual: Mat4, expected: number[]) {
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 5));
}

test("cameraMatrices: eye on +Z looking at the origin", () => {
  const pose: OrbitPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5, fovY: Math.PI / 2 };
  const m = cameraMatrices(pose, { width: 200, height: 100, dpr: 1 }, createCameraMatrices());
  expect(m.eye).toEqual([0, 0, 5]);
  expectMat(m.view, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1]);
  // f = 1 / tan(45°) = 1, aspect 2; reverse-Z depth terms A and B.
  expectMat(m.proj, [0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, A, -1, 0, 0, B, 0]);
});

test("cameraMatrices: yaw 90° looks down −X at an offset target", () => {
  const pose: OrbitPose = {
    target: [1, 2, 3],
    yaw: Math.PI / 2,
    pitch: 0,
    distance: 2,
    fovY: Math.PI / 3,
  };
  const m = cameraMatrices(pose, { width: 100, height: 100, dpr: 2 }, createCameraMatrices());
  expect(m.eye[0]).toBeCloseTo(3, 6);
  expect(m.eye[1]).toBeCloseTo(2, 6);
  expect(m.eye[2]).toBeCloseTo(3, 6);
  // Camera right is −Z, up is +Y, back is +X.
  expectMat(m.view, [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 3, -2, -3, 1]);
  const f = 1 / Math.tan(Math.PI / 6);
  expectMat(m.proj, [f, 0, 0, 0, 0, f, 0, 0, 0, 0, A, -1, 0, 0, B, 0]);
});

test("orbitEye: pitch raises the eye along the orbit sphere", () => {
  const eye: Vec3 = [0, 0, 0];
  orbitEye({ target: [0, 1, 0], yaw: 0, pitch: Math.PI / 6, distance: 2, fovY: 1 }, eye);
  expect(eye[0]).toBeCloseTo(0, 9);
  expect(eye[1]).toBeCloseTo(2, 9);
  expect(eye[2]).toBeCloseTo(Math.sqrt(3), 9);
});

test("project: reverse-Z maps near to 1 and far to 0, and flags points behind", () => {
  const m = cameraMatrices(
    { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5, fovY: 1 },
    { width: 800, height: 600, dpr: 1 },
    createCameraMatrices(),
  );
  const out = createProjected();
  expect(project(m, [0, 0, 5 - CAMERA_NEAR], out).depth).toBeCloseTo(1, 4);
  expect(project(m, [0, 0, 5 - CAMERA_FAR], out).depth).toBeCloseTo(0, 4);
  expect(project(m, [0, 0, 0], out)).toMatchObject({ x: 400, y: 300, behind: false });
  expect(project(m, [0, 0, 6], out).behind).toBe(true);
});

test("project agrees with the packed uniform within 0.5 px", () => {
  const viewport = { width: 1440, height: 900, dpr: 1 };
  const m = cameraMatrices(
    { target: [0.3, 0.6, -0.2], yaw: 0.7, pitch: 0.4, distance: 6.5, fovY: 0.75 },
    viewport,
    createCameraMatrices(),
  );
  const packed = new Float32Array(FRAME_UNIFORM_BYTES / 4);
  packFrame(packed, m, 0, viewport.width, viewport.height, 1, 1);
  const out = createProjected();
  const f = Math.fround;
  for (const p of [
    [0, 0, 0],
    [1.5, 2, -1],
    [-2.2, 0.15, 1.4],
    [3, -0.5, 2],
  ] as Vec3[]) {
    // What the vertex stage computes: viewProj (packed float32) × p, in float32.
    const clip = [0, 1, 2, 3].map((r) =>
      f(
        f(f(f(packed[r]! * f(p[0])) + f(packed[4 + r]! * f(p[1]))) + f(packed[8 + r]! * f(p[2]))) +
          packed[12 + r]!,
      ),
    ) as [number, number, number, number];
    const gx = ((clip[0] / clip[3]) * 0.5 + 0.5) * viewport.width;
    const gy = (0.5 - (clip[1] / clip[3]) * 0.5) * viewport.height;
    project(m, p, out);
    expect(Math.abs(out.x - gx)).toBeLessThan(0.5);
    expect(Math.abs(out.y - gy)).toBeLessThan(0.5);
  }
});
