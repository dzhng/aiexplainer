/**
 * Look tokens (Night lab). `look.json` is the single source: the HUD's CSS variables come
 * from `cssVars()` and the renderer receives `lookConfig()`. Palette colours are sRGB hex;
 * the renderer only ever sees them converted to linear.
 */
import raw from "./look.json";

export type PaletteToken = keyof typeof raw.palette;
export type TypeSize = keyof typeof raw.type.sizePx;
export type Rgb = [number, number, number];

export interface LookTokens {
  /** sRGB `#rrggbb` swatches shared by the HUD and the scene. */
  palette: Record<PaletteToken, string>;
  /** HUD-only CSS colours (any CSS colour syntax). */
  hud: { panel: string; line: string; muted: string; activeInk: string };
  type: { ui: string; mono: string; sizePx: Record<TypeSize, number>; lineHeight: number };
  /** HDR emissive multiplier per palette token; a token without one does not glow. */
  materials: { emissive: Partial<Record<PaletteToken, number>> };
  /** Bloom knobs (LearnOpenGL physically based bloom). Slice 08 tunes and may extend them. */
  bloom: { strength: number; filterRadius: number; mipLevels: number };
  /** Flow rhythm on pipes: pulses per second and world-space gap between pulses. */
  flow: { cyclesPerSec: number; spacing: number };
  /** Room and lighting knobs, defined by slice 07. */
  room: Record<string, never>;
  lights: Record<string, never>;
}

export const look: LookTokens = raw;

/** What the renderer is handed: every colour already linear, emissive already multiplied. */
export interface LookConfig {
  palette: Record<PaletteToken, Rgb>;
  emissive: Partial<Record<PaletteToken, Rgb>>;
  bloom: LookTokens["bloom"];
  flow: LookTokens["flow"];
  room: LookTokens["room"];
  lights: LookTokens["lights"];
}

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

/** A palette token in linear light, for the renderer. */
export function linear(token: PaletteToken): Rgb {
  const [r, g, b] = hexToSrgb(look.palette[token]);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

export function isPaletteToken(name: string): name is PaletteToken {
  return Object.hasOwn(look.palette, name);
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

export function lookConfig(): LookConfig {
  const tokens = Object.keys(look.palette) as PaletteToken[];
  const palette = Object.fromEntries(tokens.map((t) => [t, linear(t)])) as LookConfig["palette"];
  const emissive: LookConfig["emissive"] = {};
  for (const [token, gain] of Object.entries(look.materials.emissive) as [PaletteToken, number][])
    emissive[token] = palette[token].map((c) => c * gain) as Rgb;
  return {
    palette,
    emissive,
    bloom: look.bloom,
    flow: look.flow,
    room: look.room,
    lights: look.lights,
  };
}
