/**
 * GPU data layouts and the one place pmndrs `math` tuples become bytes. Every schema has
 * its byte size written beside it; a test holds the schema, the constant and the packer
 * to the same number.
 */
import { clamp } from "math";
import type { Mat3, Mat4, Vec3 } from "math";
import { d } from "typegpu";
import type { CameraMatrices } from "./camera.ts";
import type { CutPlane, LookConfig, MaterialLook } from "./frame-input.ts";
import type { Geometry } from "./kit/geometry.ts";

export const FrameUniform = d
  .struct({
    viewProj: d.mat4x4f,
    invViewProj: d.mat4x4f,
    /** xyz: eye position; w: time in seconds. */
    eye: d.vec4f,
    /** Device pixels: width, height, 1/width, 1/height. */
    viewport: d.vec4f,
    /**
     * x: emission scale (0 when the emissive layer is off); y: bloom scale (0 when off);
     * z: flow pulse scale (0 when the flows layer is off).
     */
    debug: d.vec4f,
    /** The Cutaway plane: xyz normal, w offset. */
    cutPlane: d.vec4f,
  })
  .$name("FrameUniform");
export const FRAME_UNIFORM_BYTES = 192;

/**
 * One vertex: position, baked AO, normal, baked (warm, cool) light as two unorm16s, the axis
 * point its width scales away from (`FrameDynamics.widthScale`), and how far along the part it
 * sits (a tube's arc length, where flow pulses are drawn).
 */
export const Vertex = d
  .struct({
    position: d.vec3f,
    ao: d.f32,
    normal: d.vec3f,
    light: d.u32,
    axis: d.vec3f,
    along: d.f32,
  })
  .$name("Vertex");
export const VERTEX_BYTES = 48;

export const Instance = d
  .struct({
    model: d.mat4x4f,
    normalMatrix: d.mat3x3f,
    material: d.u32,
    slot: d.u32,
    /** How far the Cutaway plane has swept in on this instance (0 = not cut). */
    cut: d.f32,
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
    specular: d.f32,
    /** 1: the surface shows only moving flow pulses (`LookConfig.flow`, `flowPhase`). */
    pulses: d.f32,
  })
  .$name("Material");
export const MATERIAL_BYTES = 48;

/** Per part slot: intensity, width scale, flow phase (cycles), unused. */
export const DYNAMICS_BYTES_PER_SLOT = 16;

export const Light = d.struct({ direction: d.vec3f, radiance: d.vec3f }).$name("Light");

/** Lights, room and post numbers from the look; rewritten only when the look changes. */
export const LookUniform = d
  .struct({
    lights: d.arrayOf(Light, 3),
    ambient: d.vec3f,
    exposure: d.f32,
    wallTop: d.vec3f,
    aoStrength: d.f32,
    wallBottom: d.vec3f,
    poolRadius: d.f32,
    poolCenter: d.vec3f,
    poolFalloff: d.f32,
    vignetteStrength: d.f32,
    vignetteRadius: d.f32,
    lightSize: d.f32,
    reflection: d.f32,
    bloomThreshold: d.f32,
    bloomKnee: d.f32,
    bloomIntensity: d.f32,
    bloomRadius: d.f32,
    saturation: d.f32,
    poolSpill: d.f32,
    flowSpacing: d.f32,
    flowDuty: d.f32,
    bakeWarm: d.vec3f,
    poolStretch: d.f32,
    bakeCool: d.vec3f,
    capColor: d.vec3f,
  })
  .$name("LookUniform");
export const LOOK_UNIFORM_BYTES = 256;

function packVec3(out: Float32Array, offset: number, v: Vec3): void {
  out[offset] = v[0];
  out[offset + 1] = v[1];
  out[offset + 2] = v[2];
}

const unorm16 = (v: number) => Math.round(clamp(v, 0, 1) * 65535);

/**
 * Writes a geometry's vertices as `Vertex` records from record `first`: AO defaults to open
 * (1), baked light to none, and the axis to the vertex itself (width scaling leaves it put).
 */
export function packVertices(
  out: Float32Array,
  first: number,
  g: Pick<Geometry, "positions" | "normals" | "ao" | "light" | "axis" | "along">,
): void {
  const u32 = new Uint32Array(out.buffer, out.byteOffset, out.length);
  for (let i = 0; i < g.positions.length / 3; i++) {
    const o = (first + i) * (VERTEX_BYTES / 4);
    out.set(g.positions.subarray(i * 3, i * 3 + 3), o);
    out[o + 3] = g.ao?.[i] ?? 1;
    out.set(g.normals.subarray(i * 3, i * 3 + 3), o + 4);
    // WGSL `unpack2x16unorm`: warm in the low half, cool in the high half.
    u32[o + 7] = g.light
      ? (unorm16(g.light[i * 2]!) | (unorm16(g.light[i * 2 + 1]!) << 16)) >>> 0
      : 0;
    out.set((g.axis ?? g.positions).subarray(i * 3, i * 3 + 3), o + 8);
    out[o + 11] = g.along?.[i] ?? 0;
  }
}

function packMat4(out: Float32Array, offset: number, m: Mat4): void {
  for (let i = 0; i < 16; i++) out[offset + i] = m[i]!;
}

/** WGSL `mat3x3f` stores each column padded to 16 bytes. */
function packMat3(out: Float32Array, offset: number, m: Mat3): void {
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
  flowScale: number,
  cut: CutPlane,
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
  out[42] = flowScale;
  out[43] = 0;
  packVec3(out, 44, cut.normal);
  out[47] = cut.offset;
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
  cut: number,
): void {
  const base = index * (INSTANCE_BYTES / 4);
  packMat4(f32, base, model);
  packMat3(f32, base + 16, normalMatrix);
  u32[base + 28] = material;
  u32[base + 29] = slot;
  f32[base + 30] = cut;
  u32[base + 31] = 0;
}

export function packMaterial(out: Float32Array, index: number, m: MaterialLook): void {
  const base = index * (MATERIAL_BYTES / 4);
  packVec3(out, base, m.baseColor);
  out[base + 3] = m.opacity;
  packVec3(out, base + 4, m.emissive);
  out[base + 7] = m.metallic;
  out[base + 8] = m.roughness;
  out[base + 9] = m.specular ?? 1;
  out[base + 10] = m.pulses ? 1 : 0;
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
  out[31] = look.room.ao;
  packVec3(out, 32, look.room.wallBottom);
  out[35] = look.lights.pool.radius;
  packVec3(out, 36, look.lights.pool.center);
  out[39] = look.lights.pool.falloff;
  out[40] = look.room.vignette.strength;
  out[41] = look.room.vignette.radius;
  out[42] = look.lights.size;
  out[43] = look.room.reflection;
  out[44] = look.bloom.threshold;
  out[45] = look.bloom.knee;
  out[46] = look.bloom.intensity;
  out[47] = look.bloom.radius;
  out[48] = look.tonemap.saturation;
  out[49] = look.lights.pool.spill;
  out[50] = look.flow.spacing;
  out[51] = look.flow.duty;
  packVec3(out, 52, look.room.bake.warm);
  out[55] = look.lights.pool.stretch;
  packVec3(out, 56, look.room.bake.cool);
  out[59] = 0;
  packVec3(out, 60, look.cutaway.cap);
  out[63] = 0;
}
