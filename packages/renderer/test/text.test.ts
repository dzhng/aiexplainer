import { describe, expect, test } from "bun:test";
import { mat4, type Vec3 } from "math";
import { d } from "typegpu";
import { cameraMatrices, createCameraMatrices } from "../src/camera.ts";
import type { Part, SceneText, TextRect } from "../src/frame-input.ts";
import { faceBasis, text, TEXT_LIFT } from "../src/kit/text.ts";
import { TextPacker } from "../src/passes/text.ts";
import { testLook } from "./look.ts";
import { TEXT_GLYPH_BYTES, TEXT_ITEM_BYTES, TextGlyph, TextItem } from "../src/pack.ts";
import {
  createTextBox,
  GLYPH_QUAD_FLOATS,
  layoutText,
  ShelfPacker,
  type Font,
  type GlyphMetrics,
} from "../src/text/layout.ts";
import { SdfScratch, signedDistance } from "../src/text/sdf.ts";

test("the text schemas match their byte sizes and pad to 16 bytes", () => {
  expect(d.sizeOf(TextGlyph)).toBe(TEXT_GLYPH_BYTES);
  expect(d.sizeOf(TextItem)).toBe(TEXT_ITEM_BYTES);
  expect(TEXT_GLYPH_BYTES % 16).toBe(0);
  expect(TEXT_ITEM_BYTES % 16).toBe(0);
  // The glyph's item index sits right after its quad and uv.
  expect(GLYPH_QUAD_FLOATS * 4).toBe(32);
});

/**
 * A monospace test font: every glyph advances 0.5 em and inks a 0.4 × 0.7 em box on the
 * baseline, except a space, which inks nothing. Its uv encodes the code point.
 */
function testFont(): Font & { calls: number } {
  const font = {
    calls: 0,
    metrics: { capHeight: 0.7, lineHeight: 1.2, descent: 0.2 },
    glyph(cp: number): GlyphMetrics {
      font.calls++;
      if (cp === 32)
        return { advance: 0.5, x0: 0, y0: 0, x1: 0, y1: 0, u0: 0, v0: 0, u1: 0, v1: 0 };
      return { advance: 0.5, x0: 0.05, y0: 0, x1: 0.45, y1: 0.7, u0: cp, v0: 0, u1: cp, v1: 1 };
    },
  };
  return font;
}

function lay(text: string, alignX: number, alignY: number) {
  const out = new Float32Array(64 * 12).fill(Number.NaN);
  const box = layoutText(text, testFont(), alignX, alignY, out, 0, 12, 64, createTextBox());
  const quads = Array.from({ length: box.count }, (_, i) =>
    Array.from(out.subarray(i * 12, i * 12 + 8)),
  );
  return { box, quads, out };
}

test("a centred line is laid out around the origin, a space inking nothing", () => {
  const { box, quads } = lay("ab c", 0.5, 0.5);
  expect(box.count).toBe(3);
  expect(box.width).toBeCloseTo(2);
  expect(box.height).toBeCloseTo(0.7);
  expect(box.left).toBeCloseTo(-1);
  expect(box.top).toBeCloseTo(0.35);
  // Glyph quads: pen + glyph box, the baseline at the box's top minus the cap height.
  expect(quads[0]!.slice(0, 4).map((v) => +v.toFixed(4))).toEqual([-0.95, -0.35, -0.55, 0.35]);
  expect(quads[2]![0]).toBeCloseTo(-1 + 1.5 + 0.05);
  // The uv is the glyph's.
  expect(quads[2]![4]).toBe("c".codePointAt(0)!);
});

test("lines stack a line height apart and align within the box", () => {
  const { box, quads } = lay("abcd\nab", 1, 0);
  expect(box.width).toBeCloseTo(2);
  expect(box.height).toBeCloseTo(0.7 + 1.2);
  expect(box.left).toBeCloseTo(-2);
  expect(box.top).toBeCloseTo(0);
  // The second, shorter line is right-aligned: it ends where the first does.
  expect(quads[5]![2]).toBeCloseTo(quads[3]![2]!);
  expect(quads[4]![1]! - quads[0]![1]!).toBeCloseTo(-1.2);
});

test("layout writes only the glyphs it reports, and stops at maxGlyphs", () => {
  const out = new Float32Array(10 * 12).fill(Number.NaN);
  const box = layoutText("abcdef", testFont(), 0, 0, out, 12, 12, 2, createTextBox());
  expect(box.count).toBe(2);
  expect(Number.isNaN(out[0]!)).toBe(true);
  expect(Number.isNaN(out[12]!)).toBe(false);
  expect(Number.isNaN(out[36]!)).toBe(true);
});

test("an empty text lays out nothing", () => {
  const { box } = lay("", 0.5, 0.5);
  expect(box.count).toBe(0);
  expect(box.width).toBe(0);
});

test("astral code points are read whole", () => {
  const seen: number[] = [];
  const font = testFont();
  const glyph = font.glyph;
  font.glyph = (cp) => (seen.push(cp), glyph(cp));
  layoutText("a😀b", font, 0, 0, new Float32Array(48), 0, 12, 4, createTextBox());
  expect(seen).toContain(0x1f600);
  expect(seen.filter((cp) => cp >= 0xd800 && cp <= 0xdfff)).toEqual([]);
});

test("the shelf packer never overlaps rectangles and stays inside the atlas", () => {
  const packer = new ShelfPacker(128, 64, 1);
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const sizes = [
    [30, 16],
    [20, 16],
    [40, 24],
    [30, 16],
    [60, 8],
    [10, 24],
    [50, 16],
  ] as const;
  for (const [w, h] of sizes) {
    const at = packer.pack(w, h);
    if (!at) continue;
    placed.push({ ...at, w, h });
  }
  expect(placed.length).toBeGreaterThan(4);
  for (const a of placed) {
    expect(a.x + a.w).toBeLessThanOrEqual(128);
    expect(a.y + a.h).toBeLessThanOrEqual(64);
    for (const b of placed) {
      if (a === b) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart).toBe(true);
    }
  }
});

test("the shelf packer reports a full atlas", () => {
  const packer = new ShelfPacker(32, 32, 0);
  expect(packer.pack(33, 1)).toBeNull();
  expect(packer.pack(32, 32)).toEqual({ x: 0, y: 0 });
  expect(packer.pack(1, 1)).toBeNull();
});

test("a disc's distance field is the distance to its circle", () => {
  const size = 48;
  const radius = 12;
  const reach = 6;
  const c = size / 2;
  // An anti-aliased disc: each pixel's coverage by 4×4 supersampling.
  const alpha = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++)
          if (Math.hypot(x + (sx + 0.5) / 4 - c, y + (sy + 0.5) / 4 - c) < radius) n++;
      alpha[y * size + x] = Math.round((n / 16) * 255);
    }
  const sdf = signedDistance(
    alpha,
    size,
    size,
    reach,
    new Uint8Array(size * size),
    new SdfScratch(64),
  );
  let worst = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const inside = radius - Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (Math.abs(inside) > reach - 1) continue;
      const expected = 0.5 + inside / (2 * reach);
      worst = Math.max(worst, Math.abs(sdf[y * size + x]! / 255 - expected));
    }
  // Within about half a pixel of distance (0.5 / (2 × reach)) everywhere in reach.
  expect(worst).toBeLessThan(0.05);
  // Saturated far outside and deep inside.
  expect(sdf[0]).toBe(0);
  expect(sdf[c * size + c]).toBe(255);
});

test("the SDF refuses a bitmap larger than its scratch", () => {
  expect(() =>
    signedDistance(new Uint8Array(100), 10, 10, 2, new Uint8Array(100), new SdfScratch(8)),
  ).toThrow();
});

const view = mat4.create();
const basis = (face: Parameters<typeof faceBasis>[0], model = mat4.create()) => {
  const right: Vec3 = [0, 0, 0];
  const up: Vec3 = [0, 0, 0];
  const normal: Vec3 = [0, 0, 0];
  faceBasis(face, model, view, right, up, normal);
  return { right, up, normal };
};
const round = (v: Vec3) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0);

test("each face's text reads left to right with its normal out of that face", () => {
  const expected = {
    front: { normal: [0, 0, 1], up: [0, 1, 0] },
    back: { normal: [0, 0, -1], up: [0, 1, 0] },
    top: { normal: [0, 1, 0], up: [0, 0, -1] },
    bottom: { normal: [0, -1, 0], up: [0, 0, 1] },
    right: { normal: [1, 0, 0], up: [0, 1, 0] },
    left: { normal: [-1, 0, 0], up: [0, 1, 0] },
  } as const;
  for (const [face, want] of Object.entries(expected)) {
    const b = basis(face as keyof typeof expected);
    expect(round(b.normal)).toEqual([...want.normal]);
    expect(round(b.up)).toEqual([...want.up]);
  }
});

test("a face follows its part's rotation but not its scale", () => {
  const model = mat4.create();
  mat4.fromYRotation(model, Math.PI / 2);
  mat4.scale(model, model, [3, 0.1, 5]);
  const b = basis("front", model);
  // +z rotated a quarter turn about y is +x; unit length whatever the part's scale.
  expect(round(b.normal)).toEqual([1, 0, 0]);
  expect(Math.hypot(...b.right)).toBeCloseTo(1);
  expect(Math.hypot(...b.up)).toBeCloseTo(1);
});

test("a camera-facing text takes the view's right and up", () => {
  const v = mat4.lookAt(mat4.create(), [3, 2, 5], [0, 0, 0], [0, 1, 0]);
  const right: Vec3 = [0, 0, 0];
  const up: Vec3 = [0, 0, 0];
  const normal: Vec3 = [0, 0, 0];
  faceBasis("camera", mat4.create(), v, right, up, normal);
  // The normal points at the eye.
  const toEye = [3, 2, 5].map((x) => x / Math.hypot(3, 2, 5));
  expect(normal[0]).toBeCloseTo(toEye[0]!);
  expect(normal[2]).toBeCloseTo(toEye[2]!);
  expect(right[1]).toBeCloseTo(0);
});

describe("the text packer", () => {
  const ITEM = TEXT_ITEM_BYTES / 4;
  const font = testFont();
  const atlas = { font: () => font };
  const part = (): Part => {
    const transform = mat4.fromTranslation(mat4.create(), [1, 2, 3]);
    mat4.scale(transform, transform, [2, 0.1, 5]);
    return { id: "card", kind: "block", material: "metal", slot: 0, transform };
  };
  const packer = (items: SceneText[]) =>
    new TextPacker(
      { revision: 0, parts: [part()], anchors: [], assets: {}, text: items },
      testLook(),
      atlas,
    );
  // 3 m in front of the card's front face, looking straight at it.
  const camera = cameraMatrices(
    { target: [1, 2, 5.5], yaw: 0, pitch: 0, distance: 3, fovY: 0.8 },
    { width: 800, height: 600 },
    createCameraMatrices(),
  );
  const word = (over: Partial<SceneText> = {}): SceneText => ({
    ...text({ id: "w", part: "card", local: [0, 0, 0.5], size: 0.1, style: "ink", text: "ab" }),
    ...over,
  });

  test("a text sits on its face, lifted, sized in metres whatever the part's scale", () => {
    const p = packer([word()]);
    expect(p.layout()).toBe(true);
    expect(p.glyphCount).toBe(2);
    p.place(camera);
    const d = [...p.itemData.subarray(0, ITEM)].map((v) => +v.toFixed(5));
    // Origin: the front face's middle (z = 3 + 5 / 2), lifted along +z.
    expect(d.slice(0, 4)).toEqual([1, 2, +(5.5 + TEXT_LIFT).toFixed(5), 1]);
    // One em along x and along y is 0.1 m: the part's 2 × 0.1 scale does not stretch it.
    expect(d.slice(4, 7)).toEqual([0.1, 0, 0]);
    expect(d.slice(8, 11)).toEqual([0, 0.1, 0]);
    // Its glyphs name their text.
    expect(p.glyphU32[GLYPH_QUAD_FLOATS]).toBe(0);
  });

  test("an unchanged text is not laid out again; a changed text is", () => {
    const item = word();
    const p = packer([item]);
    p.layout();
    expect(p.layout()).toBe(false);
    item.text = "abc";
    expect(p.layout()).toBe(true);
    expect(p.glyphCount).toBe(3);
  });

  test("maxWidth shrinks a text that would overflow, and never grows one", () => {
    const p = packer([word({ text: "abcd", maxWidth: 0.1 }), word({ id: "x", maxWidth: 5 })]);
    p.layout();
    p.place(camera);
    // "abcd" is 2 em: 0.2 m at 0.1 m per em, so it shrinks to 0.05 m per em.
    expect(p.itemData[4]).toBeCloseTo(0.05);
    expect(p.itemData[ITEM + 4]).toBeCloseTo(0.1);
  });

  test("an empty text draws nothing and has no screen box", () => {
    const p = packer([word({ text: "" }), word({ id: "shown" })]);
    p.layout();
    p.place(camera);
    expect([...p.itemData.subarray(4, 11)].every((v) => v === 0)).toBe(true);
    const out: TextRect[] = [];
    const rects = p.rects(camera, out);
    expect(rects).toBe(out);
    expect(rects.map((r) => r.id)).toEqual(["shown"]);
    // Centred on screen, as wide as its 1 em (0.1 m) box seen from 3 m away.
    const r = rects[0]!;
    expect(r.x + r.width / 2).toBeCloseTo(400, 0);
    const pxPerMetre = 600 / (2 * 3 * Math.tan(0.4));
    expect(r.width).toBeCloseTo(0.1 * pxPerMetre, 0);
  });

  test("a yielding text hides while an earlier yielding text holds its screen room", () => {
    const first = word({ id: "first", yields: true });
    const second = word({ id: "second", yields: true });
    const plain = word({ id: "plain" });
    const p = packer([first, second, plain]);
    p.layout();
    p.place(camera);
    const shown = () => p.rects(camera, []).map((r) => r.id);
    // Same spot: the first keeps it; a text that does not yield is never hidden.
    expect(shown()).toEqual(["first", "plain"]);
    expect(p.itemData[ITEM + 4]).toBe(0);
    // Moved clear (0.5 m of the card's 2 m width to the right): both show.
    second.local = [0.25, 0, 0.5];
    p.place(camera);
    expect(shown()).toEqual(["first", "second", "plain"]);
    // An empty first text claims no room.
    second.local = [0, 0, 0.5];
    first.text = "";
    p.layout();
    p.place(camera);
    expect(shown()).toEqual(["second", "plain"]);
  });

  test("an unknown style or part is an error, not a silent blank", () => {
    expect(() => packer([word({ style: "nope" })])).toThrow(/nope/);
    const p = packer([word({ part: "missing" })]);
    p.layout();
    expect(() => p.place(camera)).toThrow(/missing/);
  });
});
