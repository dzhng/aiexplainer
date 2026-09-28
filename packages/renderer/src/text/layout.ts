/**
 * Text layout and atlas packing, CPU only and pure: glyph metrics in, glyph quads out. The
 * atlas (`text/atlas.ts`) supplies the metrics; the text pass uploads the quads. Units are
 * em (the font size), x right and y up.
 */

/** One glyph's metrics in its font, and where its distance field sits in the atlas. */
export interface GlyphMetrics {
  /** Pen advance, em. */
  advance: number;
  /**
   * The glyph's quad relative to the pen on the baseline, em: left, bottom, right, top.
   * All zero for a glyph that draws nothing (a space).
   */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Its texels in the atlas, 0–1: left, top, right, bottom. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** A font's vertical metrics, em. */
export interface FontMetrics {
  /** Height of a capital above the baseline: the top of a text's box. */
  capHeight: number;
  /** Baseline to baseline. */
  lineHeight: number;
  /** How far below the baseline descenders reach (positive). */
  descent: number;
}

export interface Font {
  metrics: FontMetrics;
  /** The glyph for a code point, rasterised on first use. */
  glyph(codePoint: number): GlyphMetrics;
}

/** Floats each laid-out glyph writes: its quad (x0, y0, x1, y1) then its uv (u0, v0, u1, v1). */
export const GLYPH_QUAD_FLOATS = 8;

export interface TextBox {
  /** Glyphs written (spaces write none). */
  count: number;
  /** The box, em: the widest line, and the first line's cap height to the last baseline. */
  width: number;
  height: number;
  /** Where the box sits relative to the layout origin, em (`align` applied). */
  left: number;
  top: number;
}

export function createTextBox(): TextBox {
  return { count: 0, width: 0, height: 0, left: 0, top: 0 };
}

const NEWLINE = 10;

/** Line widths of the text being laid out; grows only for a text with more lines than ever. */
let lineWidths: Float64Array<ArrayBuffer> = new Float64Array(8);

/**
 * Lays `text` out with the origin at `align` of its box ([0, 0] top-left, [0.5, 0.5] middle,
 * [1, 1] bottom-right), each line placed across the box by `align[0]`. Writes each drawn
 * glyph's quad and uv at `out[offset + i * stride]` and returns the box in `box`. Stops
 * after `maxGlyphs`. Allocates nothing once its glyphs are cached.
 */
export function layoutText(
  text: string,
  font: Font,
  alignX: number,
  alignY: number,
  out: Float32Array,
  offset: number,
  stride: number,
  maxGlyphs: number,
  box: TextBox,
): TextBox {
  // Pass 1: every line's width.
  let lines = 0;
  let pen = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp > 0xffff) i++;
    if (cp === NEWLINE) {
      lineWidths = setGrown(lineWidths, lines++, pen);
      pen = 0;
    } else pen += font.glyph(cp).advance;
  }
  lineWidths = setGrown(lineWidths, lines++, pen);
  let width = 0;
  for (let l = 0; l < lines; l++) width = Math.max(width, lineWidths[l]!);
  const { capHeight, lineHeight } = font.metrics;
  const height = capHeight + (lines - 1) * lineHeight;
  box.width = width;
  box.height = height;
  box.left = -alignX * width;
  box.top = alignY * height;

  // Pass 2: the glyphs.
  let count = 0;
  let line = 0;
  pen = box.left + (width - lineWidths[0]!) * alignX;
  let baseline = box.top - capHeight;
  for (let i = 0; i < text.length && count < maxGlyphs; i++) {
    const cp = text.codePointAt(i)!;
    if (cp > 0xffff) i++;
    if (cp === NEWLINE) {
      line++;
      pen = box.left + (width - lineWidths[line]!) * alignX;
      baseline -= lineHeight;
      continue;
    }
    const g = font.glyph(cp);
    if (g.x1 > g.x0) {
      const o = offset + count * stride;
      out[o] = pen + g.x0;
      out[o + 1] = baseline + g.y0;
      out[o + 2] = pen + g.x1;
      out[o + 3] = baseline + g.y1;
      out[o + 4] = g.u0;
      out[o + 5] = g.v0;
      out[o + 6] = g.u1;
      out[o + 7] = g.v1;
      count++;
    }
    pen += g.advance;
  }
  box.count = count;
  return box;
}

function setGrown(
  array: Float64Array<ArrayBuffer>,
  index: number,
  value: number,
): Float64Array<ArrayBuffer> {
  let out = array;
  if (index >= out.length) {
    out = new Float64Array(out.length * 2);
    out.set(array);
  }
  out[index] = value;
  return out;
}

/**
 * Rectangles packed into rows ("shelves") of a fixed-size atlas: each goes on the first
 * shelf tall enough with room left, else on a new shelf below the last. Glyphs of one size
 * are close in height, so shelves waste little.
 */
export class ShelfPacker {
  #shelves: { y: number; height: number; x: number }[] = [];
  #bottom = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    /** Empty texels kept around each rectangle, so neighbours never bleed under filtering. */
    readonly padding = 1,
  ) {}

  /** The top-left corner for a `w`×`h` rectangle, or null when the atlas is full. */
  pack(w: number, h: number): { x: number; y: number } | null {
    const pw = w + this.padding;
    const ph = h + this.padding;
    if (pw > this.width) return null;
    for (const shelf of this.#shelves)
      if (ph <= shelf.height && shelf.x + pw <= this.width) {
        const at = { x: shelf.x, y: shelf.y };
        shelf.x += pw;
        return at;
      }
    if (this.#bottom + ph > this.height) return null;
    const shelf = { y: this.#bottom, height: ph, x: pw };
    this.#shelves.push(shelf);
    this.#bottom += ph;
    return { x: 0, y: shelf.y };
  }
}
