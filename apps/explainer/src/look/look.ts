/**
 * Look tokens (Night lab). `look.json` is the single source: the HUD's CSS variables come
 * from `cssVars()` and the renderer receives `lookConfig()`. Palette colours are sRGB hex;
 * the renderer only ever sees them converted to linear. Every number is checked here, where
 * it is loaded.
 */
import type { LightLook, LinearRgb, LookConfig, MaterialLook } from "@repo/renderer";
import raw from "./look.json";

export type PaletteToken = keyof typeof raw.palette;
export type TypeSize = keyof typeof raw.type.sizePx;
export type Rgb = [number, number, number];

/** A colour value in `look.json`: a palette token or a literal `#rrggbb`. */
export type ColourValue = PaletteToken | `#${string}`;

/** A renderer material preset; `emissive` names a palette token with a `materials.emissive` gain. */
export interface MaterialToken {
  color: ColourValue;
  emissive?: PaletteToken;
  metallic?: number;
  roughness?: number;
  opacity: number;
}

interface LightToken {
  direction: number[];
  color: ColourValue;
  intensity: number;
}

export interface LookTokens {
  /** sRGB `#rrggbb` swatches shared by the HUD and the scene. */
  palette: Record<PaletteToken, string>;
  /** HUD-only CSS colours (any CSS colour syntax). */
  hud: { panel: string; line: string; muted: string; activeInk: string };
  type: { ui: string; mono: string; sizePx: Record<TypeSize, number>; lineHeight: number };
  materials: {
    /** HDR emissive multiplier per palette token; a token without one does not glow. */
    emissive: Partial<Record<PaletteToken, number>>;
    /** Renderer material presets, bound by name (meshes by node name). */
    presets: Record<string, MaterialToken>;
  };
  /** Bloom knobs (Jimenez 2014 / LearnOpenGL physically based bloom). */
  bloom: { threshold: number; knee: number; intensity: number; radius: number };
  /** Flow rhythm on pipes: pulses per second and world-space gap between pulses. */
  flow: { cyclesPerSec: number; spacing: number };
  room: {
    wallTop: ColourValue;
    wallBottom: ColourValue;
    radius: number;
    floorFade: number;
    reflection: number;
    vignette: { strength: number; radius: number };
  };
  lights: { key: LightToken; rim: LightToken; fill: LightToken; size: number };
  ambient: { color: ColourValue; intensity: number };
  tonemap: { exposure: number; saturation: number };
}

export const look = raw as LookTokens;

/** IEC 61966-2-1 sRGB transfer function, one 0–1 channel. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hexToSrgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(match[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hexToLinear(hex: string): Rgb {
  return hexToSrgb(hex).map(srgbToLinear) as Rgb;
}

export function isPaletteToken(name: string): name is PaletteToken {
  return Object.hasOwn(look.palette, name);
}

/** A palette token in linear light, for the renderer. */
export function linear(token: PaletteToken): Rgb {
  return hexToLinear(look.palette[token]);
}

/** A palette token or a literal `#rrggbb`, in linear light. */
export function colour(value: string): Rgb {
  if (isPaletteToken(value)) return linear(value);
  if (value.startsWith("#")) return hexToLinear(value);
  throw new Error(`look: unknown colour token "${value}"`);
}

/** A token's glow: its linear colour × its `materials.emissive` gain. */
export function emissive(token: PaletteToken): Rgb {
  const gain = look.materials.emissive[token];
  if (gain === undefined) throw new Error(`look: "${token}" has no materials.emissive gain`);
  return linear(token).map((c) => c * positive(`materials.emissive.${token}`, gain)) as Rgb;
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every HUD CSS variable, e.g. `--bg-deep`, `--hud-panel`, `--font-ui`, `--text-md`. */
export function cssVars(): Record<`--${string}`, string> {
  const vars: Record<`--${string}`, string> = {};
  for (const [name, value] of Object.entries(look.palette)) vars[`--${kebab(name)}`] = value;
  for (const [name, value] of Object.entries(look.hud)) vars[`--hud-${kebab(name)}`] = value;
  vars["--font-ui"] = look.type.ui;
  vars["--font-mono"] = look.type.mono;
  for (const [name, px] of Object.entries(look.type.sizePx)) vars[`--text-${name}`] = `${px}px`;
  vars["--line-height"] = String(look.type.lineHeight);
  return vars;
}

/** Sets every HUD CSS variable on `el` (the app and the lab set them on `<html>`). */
export function applyCssVars(el: HTMLElement): void {
  for (const [name, value] of Object.entries(cssVars())) el.style.setProperty(name, value);
}

function unit(name: string, value: number): number {
  if (!(value >= 0 && value <= 1)) throw new Error(`look: ${name} ${value} is not in [0, 1]`);
  return value;
}

function positive(name: string, value: number): number {
  if (!(value > 0)) throw new Error(`look: ${name} ${value} must be positive`);
  return value;
}

function material(name: string, m: MaterialToken): MaterialLook {
  if (!(m.opacity > 0 && m.opacity <= 1))
    throw new Error(`look: ${name}.opacity ${m.opacity} is not in (0, 1]`);
  return {
    baseColor: colour(m.color),
    emissive: m.emissive ? emissive(m.emissive) : [0, 0, 0],
    metallic: unit(`${name}.metallic`, m.metallic ?? 0),
    roughness: unit(`${name}.roughness`, m.roughness ?? 0.6),
    opacity: m.opacity,
  };
}

function light(name: string, l: LightToken): LightLook {
  const [x = 0, y = 0, z = 0] = l.direction;
  const length = Math.hypot(x, y, z);
  if (l.direction.length !== 3 || !(length > 0))
    throw new Error(`look: lights.${name}.direction must be a non-zero [x, y, z]`);
  const intensity = positive(`lights.${name}.intensity`, l.intensity);
  return {
    direction: [x / length, y / length, z / length],
    radiance: colour(l.color).map((c) => c * intensity) as LinearRgb,
  };
}

/**
 * The renderer's look, all linear numbers. `extraMaterials` lets lab fixtures add swatch
 * materials without touching the product's presets.
 */
export function lookConfig(extraMaterials: Record<string, MaterialToken> = {}): LookConfig {
  const materials: Record<string, MaterialLook> = {};
  for (const [name, m] of Object.entries({ ...look.materials.presets, ...extraMaterials }))
    materials[name] = material(name, m);
  if (!materials.floor) throw new Error("look: materials.presets.floor is required");
  const { room, lights, ambient, tonemap, bloom } = look;
  return {
    room: {
      wallTop: colour(room.wallTop),
      wallBottom: colour(room.wallBottom),
      radius: positive("room.radius", room.radius),
      floorFade: unit("room.floorFade", room.floorFade),
      reflection: unit("room.reflection", room.reflection),
      vignette: {
        strength: unit("room.vignette.strength", room.vignette.strength),
        radius: unit("room.vignette.radius", room.vignette.radius),
      },
    },
    lights: {
      key: light("key", lights.key),
      rim: light("rim", lights.rim),
      fill: light("fill", lights.fill),
      size: unit("lights.size", lights.size),
    },
    ambient: colour(ambient.color).map((c) => c * ambient.intensity) as LinearRgb,
    materials: { ...materials, floor: materials.floor },
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
