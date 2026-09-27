import { expect, test } from "bun:test";
import { mat3, mat4 } from "math";
import { d } from "typegpu";
import { cameraMatrices, createCameraMatrices } from "../src/camera.ts";
import {
  FRAME_UNIFORM_BYTES,
  FrameUniform,
  Instance,
  INSTANCE_BYTES,
  Material,
  MATERIAL_BYTES,
  packFrame,
  packInstance,
  packMaterial,
  LOOK_UNIFORM_BYTES,
  LookUniform,
  packLook,
  Vertex,
  VERTEX_BYTES,
} from "../src/pack.ts";
import { testLook } from "./look.ts";

test("every schema matches its byte-size constant and is 16-byte padded", () => {
  const pairs = [
    [FrameUniform, FRAME_UNIFORM_BYTES],
    [Vertex, VERTEX_BYTES],
    [Instance, INSTANCE_BYTES],
    [Material, MATERIAL_BYTES],
    [LookUniform, LOOK_UNIFORM_BYTES],
  ] as const;
  for (const [schema, bytes] of pairs) {
    expect(d.sizeOf(schema)).toBe(bytes);
    expect(bytes % 16).toBe(0);
  }
});

/** Runs `pack` over a NaN-filled array one record wider than `bytes` and returns it. */
function packed(bytes: number, pack: (out: Float32Array) => void): Float32Array {
  const out = new Float32Array(bytes / 4 + 4).fill(Number.NaN);
  pack(out);
  return out;
}

function expectFillsExactly(out: Float32Array, bytes: number) {
  const n = bytes / 4;
  expect([...out.subarray(0, n)].some(Number.isNaN)).toBe(false);
  expect([...out.subarray(n)].every(Number.isNaN)).toBe(true);
}

test("packFrame fills exactly FRAME_UNIFORM_BYTES", () => {
  const m = cameraMatrices(
    { target: [0, 0, 0], yaw: 0.3, pitch: 0.2, distance: 4, fovY: 0.8 },
    { width: 640, height: 480, dpr: 1 },
    createCameraMatrices(),
  );
  const out = packed(FRAME_UNIFORM_BYTES, (o) => packFrame(o, m, 1.5, 640, 480, 1, 0));
  expectFillsExactly(out, FRAME_UNIFORM_BYTES);
  expect(out[35]).toBe(1.5);
  expect(out.subarray(36, 40)).toEqual(new Float32Array([640, 480, 1 / 640, 1 / 480]));
});

test("packInstance fills exactly INSTANCE_BYTES, with mat3 columns padded", () => {
  const buffer = new ArrayBuffer(INSTANCE_BYTES + 16);
  const f32 = new Float32Array(buffer).fill(Number.NaN);
  const u32 = new Uint32Array(buffer);
  const model = mat4.fromTranslation(mat4.create(), [1, 2, 3]);
  packInstance(f32, u32, 0, model, mat3.create(), 7, 9);
  expect([...f32.subarray(0, 16)]).toEqual(model);
  expect([...f32.subarray(16, 28)]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  expect([...u32.subarray(28, 32)]).toEqual([7, 9, 0, 0]);
  expect([...f32.subarray(32)].every(Number.isNaN)).toBe(true);
});

test("packMaterial and packLook fill exactly their records", () => {
  const look = testLook();
  expectFillsExactly(
    packed(MATERIAL_BYTES, (o) => packMaterial(o, 0, look.materials.metal!)),
    MATERIAL_BYTES,
  );
  expectFillsExactly(
    packed(LOOK_UNIFORM_BYTES, (o) => packLook(o, look)),
    LOOK_UNIFORM_BYTES,
  );
});
