/**
 * `/lab/tokens?section=emissive`: every palette colour as an emissive swatch at 1×, 4× and
 * 16× through the real renderer and bloom. Columns are tokens, rows are levels (1× at the
 * bottom). Slice 13 completes this page with the other sections.
 */
import type { MaterialLook, Part } from "@repo/renderer";
import { linear, look as tokens, lookConfig, type PaletteToken } from "../look/look.ts";
import { frameFromParts, type LabScene } from "./fixtures.ts";

export const EMISSIVE_LEVELS = [1, 4, 16];
const PITCH = 0.9;
const SIZE = 0.6;

export function tokensScene(section: string): LabScene {
  if (section !== "emissive") throw new Error(`unknown tokens section "${section}"`);
  const look = lookConfig();
  const palette = Object.keys(tokens.palette) as PaletteToken[];
  const parts: Part[] = [];
  const intensity: number[] = [];
  palette.forEach((token, column) => {
    const swatch: MaterialLook = {
      baseColor: [0, 0, 0],
      emissive: linear(token),
      metallic: 0,
      roughness: 0.8,
      opacity: 1,
    };
    look.materials[`swatch.${token}`] = swatch;
    EMISSIVE_LEVELS.forEach((level, row) => {
      const x = (column - (palette.length - 1) / 2) * PITCH;
      const y = 0.6 + row * PITCH;
      parts.push({
        kind: "block",
        id: `swatch.${token}.${level}`,
        slot: intensity.length,
        material: `swatch.${token}`,
        transform: [SIZE, 0, 0, 0, 0, SIZE, 0, 0, 0, 0, 0.08, 0, x, y, 0, 1],
      });
      intensity.push(level);
    });
  });
  const input = frameFromParts(
    { target: [0, 1.5, 0], yaw: 0, pitch: 0.05, distance: 11, fovY: 0.75 },
    parts,
  );
  input.dynamics.intensity.set(intensity);
  return { look, input };
}
