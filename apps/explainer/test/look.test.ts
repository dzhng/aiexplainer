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
test("sRGB → linear follows the standard on both sides of its seam", () => {
  const want: [number, number][] = [
    [0.02, 0.001548],
    [0.2, 0.0331048],
    [0.5, 0.2140411],
    [0.9, 0.7874123],
  ];
  for (const [c, l] of want) expect(srgbToLinear(c)).toBeCloseTo(l, 6);
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
  const config = lookConfig({ bar: { color: "metalDark", emissive: "flow", opacity: 1 } });
  expect(config.room.wallTop).toEqual(linear(look.room.wallTop as PaletteToken));
  expect(config.materials.bar!.baseColor).toEqual(linear("metalDark"));
  const gain = look.materials.emissive.flow!;
  expect([...config.materials.bar!.emissive]).toEqual(linear("flow").map((c) => c * gain));
  expect(config.materials.metal!.emissive).toEqual([0, 0, 0]);
});

test("a token without an emissive gain cannot glow, and bad numbers are rejected", () => {
  expect(() => lookConfig({ x: { color: "ink", emissive: "ink", opacity: 1 } })).toThrow(/ink/);
  expect(() => lookConfig({ x: { color: "ink", opacity: 1.5 } })).toThrow(/opacity/);
  expect(() => lookConfig({ x: { color: "nope" as PaletteToken, opacity: 1 } })).toThrow(/nope/);
});
