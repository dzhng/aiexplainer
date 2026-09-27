/**
 * Look tokens → the renderer's `LookConfig`. Colours in `look.json` are sRGB tokens (what a
 * designer picks); the renderer only ever receives linear light. Every number is checked
 * here, where it is loaded.
 */
import type { LightLook, LinearRgb, LookConfig, MaterialLook } from "@repo/renderer";
import type { Vec3 } from "math";
import lookJson from "./look.json";

export type LookJson = typeof lookJson;
export type ColourToken = keyof LookJson["palette"];

export interface MaterialToken {
  color: string;
  /** A palette token that glows at its `bloom.emissive` multiplier (× the part's intensity). */
  emissive?: string;
  metallic?: number;
  roughness?: number;
  opacity: number;
}

interface LightToken {
  direction: number[];
  color: string;
  intensity: number;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** `#rrggbb` → linear RGB. */
export function hexToLinear(hex: string): LinearRgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`look: "${hex}" is not a #rrggbb colour`);
  const n = parseInt(match[1]!, 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

/** A palette token, or a literal `#rrggbb`, → linear RGB. */
export function linear(token: string, look: LookJson = lookJson): LinearRgb {
  const hex = token.startsWith("#") ? token : look.palette[token as ColourToken];
  if (!hex) throw new Error(`look: unknown colour token "${token}"`);
  return hexToLinear(hex);
}

function unit(name: string, value: number): number {
  if (!(value >= 0 && value <= 1)) throw new Error(`look: ${name} ${value} is not in [0, 1]`);
  return value;
}

function positive(name: string, value: number): number {
  if (!(value > 0)) throw new Error(`look: ${name} ${value} must be positive`);
  return value;
}

function material(name: string, m: MaterialToken, look: LookJson): MaterialLook {
  if (!(m.opacity > 0 && m.opacity <= 1))
    throw new Error(`look: ${name}.opacity ${m.opacity} is not in (0, 1]`);
  return {
    baseColor: linear(m.color, look),
    emissive: m.emissive ? emissive(`${name}.emissive`, m.emissive, look) : [0, 0, 0],
    metallic: unit(`${name}.metallic`, m.metallic ?? 0),
    roughness: unit(`${name}.roughness`, m.roughness ?? 0.6),
    opacity: m.opacity,
  };
}

/** An emissive token's radiance: its linear colour × its multiplier in `bloom.emissive`. */
export function emissive(name: string, token: string, look: LookJson = lookJson): LinearRgb {
  const multiplier = (look.bloom.emissive as Record<string, number>)[token];
  if (multiplier === undefined)
    throw new Error(`look: ${name} "${token}" has no bloom.emissive multiplier`);
  return linear(token, look).map(
    (c) => c * positive(`bloom.emissive.${token}`, multiplier),
  ) as LinearRgb;
}

function light(name: string, l: LightToken, look: LookJson): LightLook {
  const [x = 0, y = 0, z = 0] = l.direction;
  const length = Math.hypot(x, y, z);
  if (l.direction.length !== 3 || !(length > 0))
    throw new Error(`look: lights.${name}.direction must be a non-zero [x, y, z]`);
  const colour = linear(l.color, look);
  const intensity = positive(`lights.${name}.intensity`, l.intensity);
  return {
    direction: [x / length, y / length, z / length] as Vec3,
    radiance: colour.map((c) => c * intensity) as LinearRgb,
  };
}

/**
 * The renderer's look. `extraMaterials` lets lab fixtures add swatch materials without
 * touching the product's presets.
 */
export function lookConfig(
  extraMaterials: Record<string, MaterialToken> = {},
  look: LookJson = lookJson,
): LookConfig {
  const materials: Record<string, MaterialLook> = {};
  for (const [name, m] of Object.entries({ ...look.materials, ...extraMaterials }))
    materials[name] = material(name, m, look);
  const { room, lights, ambient, tonemap, bloom } = look;
  return {
    room: {
      wallTop: linear(room.wallTop, look),
      wallBottom: linear(room.wallBottom, look),
      radius: positive("room.radius", room.radius),
      floorFade: unit("room.floorFade", room.floorFade),
      reflection: unit("room.reflection", room.reflection),
      vignette: {
        strength: unit("room.vignette.strength", room.vignette.strength),
        radius: unit("room.vignette.radius", room.vignette.radius),
      },
    },
    lights: {
      key: light("key", lights.key, look),
      rim: light("rim", lights.rim, look),
      fill: light("fill", lights.fill, look),
      size: unit("lights.size", lights.size),
    },
    ambient: linear(ambient.color, look).map((c) => c * ambient.intensity) as LinearRgb,
    materials: { ...materials, floor: materials.floor! },
    tonemap: {
      exposure: positive("tonemap.exposure", tonemap.exposure),
      saturation: positive("tonemap.saturation", tonemap.saturation),
    },
    bloom: {
      threshold: positive("bloom.threshold", bloom.threshold),
      knee: positive("bloom.knee", bloom.knee),
      intensity: unit("bloom.intensity", bloom.intensity),
      radius: positive("bloom.radius", bloom.radius),
    },
  };
}
