/**
 * GPU data layouts and the one place pmndrs `math` tuples become bytes. Every schema has
 * its byte size written beside it; a test holds the schema, the constant and the packer
 * to the same number.
 */
import type { Mat3, Mat4, Vec3 } from "math";
import { d } from "typegpu";
import type { CameraMatrices } from "./camera.ts";
import type { LookConfig, MaterialLook } from "./frame-input.ts";

export const FrameUniform = d
  .struct({
    viewProj: d.mat4x4f,
    invViewProj: d.mat4x4f,
    /** xyz: eye position; w: time in seconds. */
    eye: d.vec4f,
    /** Device pixels: width, height, 1/width, 1/height. */
    viewport: d.vec4f,
    /** x: emission scale (0 when the emissive layer is off); y: bloom scale (0 when off). */
    debug: d.vec4f,
  })
  .$name("FrameUniform");
export const FRAME_UNIFORM_BYTES = 176;

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
    emissive: d.vec3f,
    metallic: d.f32,
    roughness: d.f32,
  })
  .$name("Material");
export const MATERIAL_BYTES = 48;

/** Per part slot: intensity, width scale, flow phase, unused. */
export const DYNAMICS_BYTES_PER_SLOT = 16;

export const Light = d.struct({ direction: d.vec3f, radiance: d.vec3f }).$name("Light");

/** Lights, room and post numbers from the look; rewritten only when the look changes. */
export const LookUniform = d
  .struct({
    lights: d.arrayOf(Light, 3),
    ambient: d.vec3f,
    exposure: d.f32,
    wallTop: d.vec3f,
    roomRadius: d.f32,
    wallBottom: d.vec3f,
    floorFade: d.f32,
    floorColor: d.vec3f,
    floorRoughness: d.f32,
    vignetteStrength: d.f32,
    vignetteRadius: d.f32,
    lightSize: d.f32,
    reflection: d.f32,
    bloomThreshold: d.f32,
    bloomKnee: d.f32,
    bloomIntensity: d.f32,
    bloomRadius: d.f32,
    saturation: d.f32,
  })
  .$name("LookUniform");
export const LOOK_UNIFORM_BYTES = 208;

export function packVec3(out: Float32Array, offset: number, v: Vec3): void {
  out[offset] = v[0];
  out[offset + 1] = v[1];
  out[offset + 2] = v[2];
}

/** Writes `positions`/`normals` (xyz each) as `Vertex` records starting at record `first`. */
export function packVertices(
  out: Float32Array,
  first: number,
  positions: Float32Array,
  normals: Float32Array,
): void {
  for (let i = 0; i < positions.length / 3; i++) {
    const o = (first + i) * (VERTEX_BYTES / 4);
    out.set(positions.subarray(i * 3, i * 3 + 3), o);
    out[o + 3] = 0;
    out.set(normals.subarray(i * 3, i * 3 + 3), o + 4);
    out[o + 7] = 0;
  }
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
  emissiveScale: number,
  bloomScale: number,
): void {
  packMat4(out, 0, m.viewProj);
  packMat4(out, 16, m.invViewProj);
  packVec3(out, 32, m.eye);
  out[35] = timeSec;
  out[36] = pixelWidth;
  out[37] = pixelHeight;
  out[38] = 1 / pixelWidth;
  out[39] = 1 / pixelHeight;
  out[40] = emissiveScale;
  out[41] = bloomScale;
  out[42] = 0;
  out[43] = 0;
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

export function packMaterial(out: Float32Array, index: number, m: MaterialLook): void {
  const base = index * (MATERIAL_BYTES / 4);
  packVec3(out, base, m.baseColor);
  out[base + 3] = m.opacity;
  packVec3(out, base + 4, m.emissive);
  out[base + 7] = m.metallic;
  out[base + 8] = m.roughness;
  out[base + 9] = 0;
  out[base + 10] = 0;
  out[base + 11] = 0;
}

export function packLook(out: Float32Array, look: LookConfig): void {
  const { key, rim, fill } = look.lights;
  [key, rim, fill].forEach((light, i) => {
    packVec3(out, i * 8, light.direction);
    out[i * 8 + 3] = 0;
    packVec3(out, i * 8 + 4, light.radiance);
    out[i * 8 + 7] = 0;
  });
  packVec3(out, 24, look.ambient);
  out[27] = look.tonemap.exposure;
  packVec3(out, 28, look.room.wallTop);
  out[31] = look.room.radius;
  packVec3(out, 32, look.room.wallBottom);
  out[35] = look.room.floorFade;
  packVec3(out, 36, look.materials.floor.baseColor);
  out[39] = look.materials.floor.roughness;
  out[40] = look.room.vignette.strength;
  out[41] = look.room.vignette.radius;
  out[42] = look.lights.size;
  out[43] = look.room.reflection;
  out[44] = look.bloom.threshold;
  out[45] = look.bloom.knee;
  out[46] = look.bloom.intensity;
  out[47] = look.bloom.radius;
  out[48] = look.tonemap.saturation;
  out[49] = 0;
  out[50] = 0;
  out[51] = 0;
}
