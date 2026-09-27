import { expect, test } from "bun:test";
import {
  cssVars,
  linear,
  look,
  lookConfig,
  srgbToLinear,
  type PaletteToken,
} from "../src/look/look.ts";

// Reference values from the IEC 61966-2-1 transfer function, computed independently.
test("sRGB → linear is right on the token swatches", () => {
  const expectRgb = (token: PaletteToken, want: [number, number, number]) =>
    linear(token).forEach((c, i) => expect(c).toBeCloseTo(want[i]!, 6));
  expectRgb("ink", [0.8069523, 0.838799, 1]);
  expectRgb("focus", [1, 0.4793202, 0.1470273]);
  expectRgb("bgDeep", [0.0033465, 0.0051815, 0.0144438]);
});

test("the transfer function is continuous at its linear/power seam", () => {
  expect(srgbToLinear(0.04045)).toBeCloseTo(srgbToLinear(0.04045 + 1e-9), 8);
  expect(srgbToLinear(0)).toBe(0);
  expect(srgbToLinear(1)).toBe(1);
});

test("every palette token is a #rrggbb swatch", () => {
  for (const hex of Object.values(look.palette)) expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
});

test("the HUD CSS variables and the renderer config come from the same tokens", () => {
  const vars = cssVars();
  expect(vars["--bg-deep"]).toBe(look.palette.bgDeep);
  expect(vars["--hud-panel"]).toBe(look.hud.panel);
  expect(vars["--text-md"]).toBe(`${look.type.sizePx.md}px`);
  const config = lookConfig();
  expect(config.palette.flow).toEqual(linear("flow"));
  const gain = look.materials.emissive.flow!;
  expect(config.emissive.flow as number[]).toEqual(linear("flow").map((c) => c * gain));
  expect(config.emissive.ink).toBeUndefined();
});
