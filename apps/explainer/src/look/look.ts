/**
 * Look tokens (Night lab). `look.json` is the single source: the HUD's CSS variables come
 * from `cssVars()` and the renderer receives `lookConfig()`. Palette colours are sRGB hex;
 * the renderer only ever sees them converted to linear. Every number is checked here, where
 * it is loaded.
 */
import type { LightLook, LinearRgb, LookConfig, MaterialLook, TextStyleLook } from "@repo/renderer";
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
  /** Specular scale, 0–1 (default 1); 0 for a surface that only darkens (a contact shadow). */
  specular?: number;
  /** Shows only moving flow pulses (`flow`), in its emissive colour; needs opacity < 1. */
  pulses?: boolean;
}

/**
 * A scene text style: a HUD type face and weight, and the letters' colour × `gain` as their
 * radiance. `glow` adds that colour × `glow` as emission (bloom picks it up); `outline` rims
 * each letter, `width` em wide.
 */
export interface TextToken {
  face: "ui" | "display" | "mono";
  weight: number;
  color: ColourValue;
  gain: number;
  glow?: number;
  outline?: { color: ColourValue; width: number };
}

interface LightToken {
  direction: number[];
  color: ColourValue;
  intensity: number;
}

export interface LookTokens {
  /** sRGB `#rrggbb` swatches shared by the HUD and the scene. */
  palette: Record<PaletteToken, string>;
  /**
   * HUD-only CSS values (any CSS colour syntax, or a length for the corner cuts): the game-UI
   * frame (holo-tactical) is a cut-corner panel with a thin accent stroke and a faint
   * scanline fill; `accent` is the HUD's own cyan (the scene's `active` stays the scene's).
   */
  hud: {
    panel: string;
    panelTop: string;
    line: string;
    frame: string;
    scan: string;
    muted: string;
    accent: string;
    accentSoft: string;
    glow: string;
    activeInk: string;
    /** The "a real model is running" indicator (the room's own status-light green). */
    live: string;
    cut: string;
    cutSmall: string;
  };
  type: {
    ui: string;
    display: string;
    mono: string;
    sizePx: Record<TypeSize, number>;
    lineHeight: number;
  };
  materials: {
    /** HDR emissive multiplier per palette token; a token without one does not glow. */
    emissive: Partial<Record<PaletteToken, number>>;
    /** Renderer material presets, bound by name (meshes by node name). */
    presets: Record<string, MaterialToken>;
  };
  /** Scene text styles, by the name a `SceneText` uses. */
  text: Record<string, TextToken>;
  /** Bloom knobs (Jimenez 2014 / LearnOpenGL physically based bloom). */
  bloom: { threshold: number; knee: number; intensity: number; radius: number };
  /**
   * Flow rhythm on pipes: pulses passing a point per second, the world-space gap between
   * pulses, and the lit share of that gap.
   */
  flow: { cyclesPerSec: number; spacing: number; duty: number };
  /** The environment: the lab room prop's own glows and AO, and the reflected gradient. */
  room: {
    /** Specular surfaces reflect this vertical gradient (and it fills any gap in the room). */
    wallTop: ColourValue;
    wallBottom: ColourValue;
    /** How strongly the prop's baked ambient occlusion darkens, 0–1. */
    ao: number;
    reflection: number;
    vignette: { strength: number; radius: number };
    /** The night outside the window: the sky card's glow and the distant lit windows. */
    window: {
      sky: ColourValue;
      skyGlow: number;
      city: ColourValue;
      cityGlow: number;
      /** The faint glow along the horizon, behind the skyline. */
      horizon: ColourValue;
      horizonGlow: number;
    };
    /** The orbit stays inside the room: a world box for target and eye, pitch and distance. */
    camera: { bounds: number[]; minPitch: number; maxPitch: number; maxDistance: number };
    /**
     * The room's own lights, by the preset their nodes bind (`room.practical.*`, the lamp):
     * `glow` is the emitter's own radiance; for the lamp (warm) and the strips (cool),
     * `spill` is the light it casts on the room (the prop's baked channels at 1). The rack's
     * indicator LEDs and the desk screens only glow.
     */
    practicals: Record<"lamp" | "practical", { color: ColourValue; glow: number; spill: number }> &
      Record<"indicator" | "screen", { color: ColourValue; glow: number }>;
  };
  lights: {
    key: LightToken;
    rim: LightToken;
    fill: LightToken;
    size: number;
    /** Direct light falls off outside this pool (metres, horizontal) so the room stays dim. */
    pool: { center: number[]; radius: number; falloff: number; spill: number; stretch: number };
  };
  ambient: { color: ColourValue; intensity: number };
  tonemap: { exposure: number; saturation: number };
}

export const look = raw as LookTokens;

/** IEC 61966-2-1 sRGB transfer function, one 0–1 channel. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToSrgb(hex: string): Rgb {
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
function colour(value: string): Rgb {
  if (isPaletteToken(value)) return linear(value);
  if (value.startsWith("#")) return hexToLinear(value);
  throw new Error(`look: unknown colour token "${value}"`);
}

/** A token's glow: its linear colour × its `materials.emissive` gain. */
function emissive(token: PaletteToken): Rgb {
  const gain = look.materials.emissive[token];
  if (gain === undefined) throw new Error(`look: "${token}" has no materials.emissive gain`);
  return linear(token).map((c) => c * positive(`materials.emissive.${token}`, gain)) as Rgb;
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every HUD CSS variable, e.g. `--bg-deep`, `--hud-panel`, `--font-display`, `--text-md`. */
export function cssVars(): Record<`--${string}`, string> {
  const vars: Record<`--${string}`, string> = {};
  for (const [name, value] of Object.entries(look.palette)) vars[`--${kebab(name)}`] = value;
  for (const [name, value] of Object.entries(look.hud)) vars[`--hud-${kebab(name)}`] = value;
  vars["--font-ui"] = look.type.ui;
  vars["--font-display"] = look.type.display;
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
    specular: unit(`${name}.specular`, m.specular ?? 1),
    pulses: pulsing(name, m),
  };
}

function pulsing(name: string, m: MaterialToken): boolean {
  if (m.pulses && !(m.opacity < 1))
    throw new Error(`look: ${name} shows pulses, so it must be translucent (opacity < 1)`);
  return m.pulses ?? false;
}

/** A room glow: an unlit surface (black base) that emits `color × glow`. */
function glow(name: string, color: ColourValue, gain: number): MaterialLook {
  return {
    baseColor: [0, 0, 0],
    emissive: colour(color).map((c) => c * positive(name, gain)) as Rgb,
    metallic: 0,
    roughness: 1,
    opacity: 1,
  };
}

/** The light a room practical casts, at a baked light value of 1. */
function spill(name: string, p: { color: ColourValue; spill: number }): LinearRgb {
  const gain = positive(`room.practicals.${name}.spill`, p.spill);
  return colour(p.color).map((c) => c * gain) as LinearRgb;
}

/** Presets the room prop binds whose numbers live in `room` (its window and practicals). */
function roomMaterials(room: LookTokens["room"]): Record<string, MaterialLook> {
  const { window: w, practicals } = room;
  const materials: Record<string, MaterialLook> = {
    sky: glow("room.window.skyGlow", w.sky, w.skyGlow),
    city: glow("room.window.cityGlow", w.city, w.cityGlow),
    horizon: glow("room.window.horizonGlow", w.horizon, w.horizonGlow),
  };
  for (const [name, p] of Object.entries(practicals))
    materials[name] = glow(`room.practicals.${name}.glow`, p.color, p.glow);
  return materials;
}

function textStyle(name: string, t: TextToken): TextStyleLook {
  const scale = (c: Rgb, k: number) => c.map((v) => v * k) as Rgb;
  const base = colour(t.color);
  const width = t.outline?.width ?? 0;
  if (!(width >= 0 && width <= 0.2))
    throw new Error(`look: text.${name}.outline.width ${width} is not in [0, 0.2] em`);
  if (!(t.weight >= 100 && t.weight <= 900))
    throw new Error(`look: text.${name}.weight ${t.weight} is not a font weight`);
  return {
    family: look.type[t.face],
    weight: t.weight,
    color: scale(base, positive(`text.${name}.gain`, t.gain)),
    emissive: t.glow === undefined ? [0, 0, 0] : scale(base, positive(`text.${name}.glow`, t.glow)),
    outline: { color: t.outline ? colour(t.outline.color) : [0, 0, 0], width },
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
  const { room, lights, ambient, tonemap, bloom } = look;
  const materials: Record<string, MaterialLook> = roomMaterials(room);
  for (const [name, m] of Object.entries({ ...look.materials.presets, ...extraMaterials })) {
    if (name in materials) throw new Error(`look: preset "${name}" is owned by room`);
    materials[name] = material(name, m);
  }
  const [cx = 0, cy = 0, cz = 0] = lights.pool.center;
  if (lights.pool.center.length !== 3)
    throw new Error("look: lights.pool.center must be [x, y, z]");
  return {
    room: {
      wallTop: colour(room.wallTop),
      wallBottom: colour(room.wallBottom),
      ao: unit("room.ao", room.ao),
      bake: {
        warm: spill("lamp", room.practicals.lamp),
        cool: spill("practical", room.practicals.practical),
      },
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
      pool: {
        center: [cx, cy, cz],
        radius: positive("lights.pool.radius", lights.pool.radius),
        falloff: positive("lights.pool.falloff", lights.pool.falloff),
        spill: unit("lights.pool.spill", lights.pool.spill),
        stretch: positive("lights.pool.stretch", lights.pool.stretch),
      },
    },
    ambient: colour(ambient.color).map((c) => c * ambient.intensity) as LinearRgb,
    materials,
    text: Object.fromEntries(
      Object.entries(look.text).map(([name, t]) => [name, textStyle(name, t)]),
    ),
    tonemap: {
      exposure: positive("tonemap.exposure", tonemap.exposure),
      saturation: positive("tonemap.saturation", tonemap.saturation),
    },
    flow: {
      spacing: positive("flow.spacing", look.flow.spacing),
      duty: unit("flow.duty", look.flow.duty),
    },
    bloom: {
      threshold: positive("bloom.threshold", bloom.threshold),
      knee: positive("bloom.knee", bloom.knee),
      intensity: unit("bloom.intensity", bloom.intensity),
      radius: positive("bloom.radius", bloom.radius),
    },
  };
}
