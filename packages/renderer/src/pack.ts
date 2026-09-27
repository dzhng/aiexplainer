/**
 * GPU data layouts and the one place pmndrs `math` tuples become bytes. Every schema has
 * its byte size written beside it; a test holds the schema, the constant and the packer
 * to the same number.
 */
import type { Mat3, Mat4, Vec3 } from "math";
import { d } from "typegpu";
import type { CameraMatrices } from "./camera.ts";

export const FrameUniform = d
  .struct({
    viewProj: d.mat4x4f,
    invViewProj: d.mat4x4f,
    /** xyz: eye position; w: time in seconds. */
    eye: d.vec4f,
    /** Device pixels: width, height, 1/width, 1/height. */
    viewport: d.vec4f,
  })
  .$name("FrameUniform");
export const FRAME_UNIFORM_BYTES = 160;

export const Vertex = d.struct({ position: d.vec3f, normal: d.vec3f }).$name("Vertex");
export const VERTEX_BYTES = 32;

export const Instance = d
  .struct({
    model: d.mat4x4f,
    normalMatrix: d.mat3x3f,
    material: d.u32,
    slot: d.u32,
  })
  .$name("Instance");
export const INSTANCE_BYTES = 128;

export const Material = d
  .struct({
    baseColor: d.vec3f,
    opacity: d.f32,
  })
  .$name("Material");
export const MATERIAL_BYTES = 16;

/** Per part slot: intensity, width scale, flow phase, unused. */
export const DYNAMICS_BYTES_PER_SLOT = 16;

export const RoomUniform = d
  .struct({
    wallTop: d.vec3f,
    wallBottom: d.vec3f,
  })
  .$name("RoomUniform");
export const ROOM_UNIFORM_BYTES = 32;

export function packVec3(out: Float32Array, offset: number, v: Vec3): void {
  out[offset] = v[0];
  out[offset + 1] = v[1];
  out[offset + 2] = v[2];
}

export function packMat4(out: Float32Array, offset: number, m: Mat4): void {
  for (let i = 0; i < 16; i++) out[offset + i] = m[i]!;
}

/** WGSL `mat3x3f` stores each column padded to 16 bytes. */
export function packMat3(out: Float32Array, offset: number, m: Mat3): void {
  for (let c = 0; c < 3; c++) {
    out[offset + c * 4] = m[c * 3]!;
    out[offset + c * 4 + 1] = m[c * 3 + 1]!;
    out[offset + c * 4 + 2] = m[c * 3 + 2]!;
    out[offset + c * 4 + 3] = 0;
  }
}

export function packFrame(
  out: Float32Array,
  m: CameraMatrices,
  timeSec: number,
  pixelWidth: number,
  pixelHeight: number,
): void {
  packMat4(out, 0, m.viewProj);
  packMat4(out, 16, m.invViewProj);
  packVec3(out, 32, m.eye);
  out[35] = timeSec;
  out[36] = pixelWidth;
  out[37] = pixelHeight;
  out[38] = 1 / pixelWidth;
  out[39] = 1 / pixelHeight;
}

/** Writes instance `index` into views over the same instance buffer. */
export function packInstance(
  f32: Float32Array,
  u32: Uint32Array,
  index: number,
  model: Mat4,
  normalMatrix: Mat3,
  material: number,
  slot: number,
): void {
  const base = index * (INSTANCE_BYTES / 4);
  packMat4(f32, base, model);
  packMat3(f32, base + 16, normalMatrix);
  u32[base + 28] = material;
  u32[base + 29] = slot;
  u32[base + 30] = 0;
  u32[base + 31] = 0;
}

export function packMaterial(
  out: Float32Array,
  index: number,
  baseColor: Vec3,
  opacity: number,
): void {
  const base = index * (MATERIAL_BYTES / 4);
  packVec3(out, base, baseColor);
  out[base + 3] = opacity;
}

export function packRoom(out: Float32Array, wallTop: Vec3, wallBottom: Vec3): void {
  packVec3(out, 0, wallTop);
  out[3] = 0;
  packVec3(out, 4, wallBottom);
  out[7] = 0;
}
