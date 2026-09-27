/**
 * Look tokens → the renderer's `LookConfig`. Colours in `look.json` are sRGB tokens (what a
 * designer picks); the renderer only ever receives linear light.
 */
import type { LinearRgb, LookConfig, MaterialLook } from "@repo/renderer";
import lookJson from "./look.json";

export type LookJson = typeof lookJson;
export type ColourToken = keyof LookJson["palette"];

export interface MaterialToken {
  color: string;
  opacity: number;
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

function material(m: MaterialToken, look: LookJson): MaterialLook {
  if (!(m.opacity > 0 && m.opacity <= 1))
    throw new Error(`look: opacity ${m.opacity} is not in (0, 1]`);
  return { baseColor: linear(m.color, look), opacity: m.opacity };
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
    materials[name] = material(m, look);
  return {
    room: {
      wallTop: linear(look.room.wallTop, look),
      wallBottom: linear(look.room.wallBottom, look),
    },
    materials,
  };
}
