import { expect, test } from "bun:test";
import { mat4, type Mat4, type Vec3 } from "math";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  cameraMatrices,
  createCameraMatrices,
  createProjected,
  orbitEye,
  partCut,
  partWorld,
  project,
} from "../src/camera.ts";
import type { OrbitPose, Part, ViewMode } from "../src/frame-input.ts";
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
  packFrame(packed, m, 0, viewport.width, viewport.height, 1, 1, {
    normal: [0, 0, 1],
    offset: 0.25,
  });
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

test("partWorld: Exploded moves a part by explode × t; Whole and Cutaway leave it as authored", () => {
  const part: Part = {
    kind: "block",
    id: "a",
    slot: 0,
    material: "metal",
    transform: mat4.fromTranslation(mat4.create(), [1, 2, 3]),
    explode: [0, 0, 2],
    cutaway: "clip",
  };
  const at = (mode: ViewMode, t: number) => [
    ...partWorld(part, { mode, t }, mat4.create()).slice(12, 15),
  ];
  expect(at("exploded", 0)).toEqual([1, 2, 3]);
  expect(at("exploded", 0.5)).toEqual([1, 2, 4]);
  expect(at("exploded", 1)).toEqual([1, 2, 5]);
  expect(at("whole", 1)).toEqual([1, 2, 3]);
  expect(at("cutaway", 1)).toEqual([1, 2, 3]);
  // A part without an explode vector stays put.
  const plain = { ...part, explode: undefined };
  expect([...partWorld(plain, { mode: "exploded", t: 1 }, mat4.create()).slice(12, 15)]).toEqual([
    1, 2, 3,
  ]);
});

test("partCut: only Cutaway cuts, only clip parts, by t", () => {
  const clip: Part = {
    kind: "block",
    id: "a",
    slot: 0,
    material: "m",
    transform: mat4.create(),
    cutaway: "clip",
  };
  const keep: Part = { ...clip, cutaway: "keep" };
  const unset: Part = { ...clip, cutaway: undefined };
  expect(partCut(clip, { mode: "cutaway", t: 0.25 })).toBe(0.25);
  expect(partCut(clip, { mode: "cutaway", t: 1 })).toBe(1);
  expect(partCut(keep, { mode: "cutaway", t: 1 })).toBe(0);
  expect(partCut(unset, { mode: "cutaway", t: 1 })).toBe(0);
  expect(partCut(clip, { mode: "exploded", t: 1 })).toBe(0);
  expect(partCut(clip, { mode: "whole", t: 1 })).toBe(0);
});
