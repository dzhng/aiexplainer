/**
 * The glyph atlas: the one owner of every rasterised glyph. Each font (weight and family) is
 * rasterised with Canvas2D from the page's own (self-hosted) fonts, glyph by glyph on first
 * use, turned into a signed distance field and written into one `r8unorm` atlas texture,
 * which the registry allocated. Printable ASCII is rasterised up front, so steady frames
 * never rasterise; any other character is added when a text first uses it.
 */
import type { TextStyleLook } from "../frame-input.ts";
import { ShelfPacker, type Font, type FontMetrics, type GlyphMetrics } from "./layout.ts";
import { SdfScratch, signedDistance } from "./sdf.ts";

/** The atlas size, texels. */
export const ATLAS_SIZE = [2048, 1024] as const;
/** Glyphs are rasterised at this font size, pixels: one em is this many atlas texels. */
export const EM_PX = 40;
/** Distance-field reach either side of the outline, texels; also each glyph's empty margin. */
export const SDF_RADIUS = 8;
/** Baseline to baseline, em. */
const LINE_HEIGHT = 1.2;
/** Glyph cells are rounded up to this many texels tall, so shelves fill evenly. */
const ROW_STEP = 8;
/** The largest glyph bitmap, texels (a very wide glyph is clipped). */
const MAX_CELL = EM_PX * 2 + 2 * SDF_RADIUS;

const EMPTY: Omit<GlyphMetrics, "advance"> = {
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  u0: 0,
  v0: 0,
  u1: 0,
  v1: 0,
};

/** The CSS font for a style at the raster size. */
export function cssFont(style: Pick<TextStyleLook, "family" | "weight">, px = EM_PX): string {
  return `${style.weight} ${px}px ${style.family}`;
}

/** Waits for every style's font to load, so no glyph is rasterised in a fallback face. */
export async function loadFonts(styles: Iterable<TextStyleLook>): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const fonts = new Set([...styles].map((s) => cssFont(s)));
  await Promise.all([...fonts].map((font) => document.fonts.load(font)));
}

export class GlyphAtlas {
  #fonts = new Map<string, Font>();
  #packer = new ShelfPacker(ATLAS_SIZE[0], ATLAS_SIZE[1], 1);
  #canvas = new OffscreenCanvas(MAX_CELL, MAX_CELL);
  #ctx = this.#canvas.getContext("2d", { willReadFrequently: true })!;
  #scratch = new SdfScratch(MAX_CELL);
  #sdf = new Uint8Array(MAX_CELL * MAX_CELL);

  constructor(
    private readonly device: GPUDevice,
    /** `ATLAS_SIZE` `r8unorm`, sampled and copy-destination. */
    private readonly texture: GPUTexture,
  ) {}

  /** The font for a style; its ASCII glyphs are rasterised now. */
  font(style: Pick<TextStyleLook, "family" | "weight">): Font {
    const key = cssFont(style);
    let font = this.#fonts.get(key);
    if (font) return font;
    const glyphs = new Map<number, GlyphMetrics>();
    this.#ctx.font = key;
    const cap = this.#ctx.measureText("H").actualBoundingBoxAscent / EM_PX;
    const descent = this.#ctx.measureText("gjpqy").actualBoundingBoxDescent / EM_PX;
    const metrics: FontMetrics = { capHeight: cap, lineHeight: LINE_HEIGHT, descent };
    font = {
      metrics,
      glyph: (cp) => {
        let g = glyphs.get(cp);
        if (!g) {
          g = this.#rasterise(key, cp);
          glyphs.set(cp, g);
        }
        return g;
      },
    };
    this.#fonts.set(key, font);
    for (let cp = 32; cp < 127; cp++) font.glyph(cp);
    return font;
  }

  #rasterise(font: string, cp: number): GlyphMetrics {
    const ctx = this.#ctx;
    const char = String.fromCodePoint(cp);
    ctx.font = font;
    const m = ctx.measureText(char);
    const advance = m.width / EM_PX;
    const left = Math.ceil(m.actualBoundingBoxLeft);
    const ascent = Math.ceil(m.actualBoundingBoxAscent);
    const inkWidth = Math.ceil(m.actualBoundingBoxRight) + left;
    const inkHeight = Math.ceil(m.actualBoundingBoxDescent) + ascent;
    if (inkWidth <= 0 || inkHeight <= 0) return { advance, ...EMPTY };
    const w = Math.min(MAX_CELL, inkWidth + 2 * SDF_RADIUS);
    const h = Math.min(MAX_CELL, inkHeight + 2 * SDF_RADIUS);
    const at = this.#packer.pack(w, Math.ceil(h / ROW_STEP) * ROW_STEP);
    if (!at) throw new Error(`text: the glyph atlas is full (adding U+${cp.toString(16)})`);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    // The pen sits `left` + margin in from the cell's left, the baseline `ascent` + margin down.
    ctx.fillText(char, SDF_RADIUS + left, SDF_RADIUS + ascent);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
    signedDistance(alpha, w, h, SDF_RADIUS, this.#sdf, this.#scratch);
    this.device.queue.writeTexture(
      { texture: this.texture, origin: [at.x, at.y] },
      this.#sdf,
      { bytesPerRow: w, rowsPerImage: h },
      [w, h],
    );
    const x0 = -(SDF_RADIUS + left) / EM_PX;
    const y1 = (SDF_RADIUS + ascent) / EM_PX;
    return {
      advance,
      x0,
      y0: y1 - h / EM_PX,
      x1: x0 + w / EM_PX,
      y1,
      u0: at.x / ATLAS_SIZE[0],
      v0: at.y / ATLAS_SIZE[1],
      u1: (at.x + w) / ATLAS_SIZE[0],
      v1: (at.y + h) / ATLAS_SIZE[1],
    };
  }
}
