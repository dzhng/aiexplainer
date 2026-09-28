/**
 * The text pass: every `SceneText` as instanced glyph quads in the world, drawn in the
 * colour pass after the translucent geometry (depth read, never written), so whatever
 * stands in front hides it. Each glyph samples its distance field in the atlas and turns it
 * into coverage one screen pixel wide (`fwidth`), so letters stay crisp at any size.
 *
 * `TextPacker` is its CPU half, one per uploaded scene: glyph quads are laid out only when a
 * text changes; each text's placement (its part's transform, its face, the camera for a
 * billboard) is packed every frame. Neither allocates once the glyphs are cached.
 */
import { vec3, type Vec3 } from "math";
import { d, tgpu, type TgpuRoot } from "typegpu";
import { createProjected, project, type CameraMatrices, type ScreenRect } from "../camera.ts";
import type {
  LookConfig,
  Part,
  SceneDesc,
  SceneText,
  TextRect,
  TextStyleLook,
} from "../frame-input.ts";
import { faceBasis } from "../kit/text.ts";
import { TEXT_GLYPH_BYTES, TEXT_ITEM_BYTES, TextGlyph, TextItem } from "../pack.ts";
import {
  createPipeline,
  DEPTH,
  frameLayout,
  HDR_FORMAT,
  TEXT_BLEND,
  SAMPLE_COUNT,
  type PipelineSpec,
} from "../pipeline.ts";
import { EM_PX, SDF_RADIUS, type GlyphAtlas } from "../text/atlas.ts";
import {
  createTextBox,
  GLYPH_QUAD_FLOATS,
  layoutText,
  type Font,
  type TextBox,
} from "../text/layout.ts";

/** Group 1 in the text pass: the laid-out glyphs, the placed texts and the atlas. */
export const textLayout = tgpu
  .bindGroupLayout({
    glyphs: { storage: d.arrayOf(TextGlyph), access: "readonly" },
    items: { storage: d.arrayOf(TextItem), access: "readonly" },
    atlas: { texture: d.texture2d(d.f32) },
    linear: { sampler: "filtering" },
  })
  .$idx(1);

const template = /* wgsl */ `
struct TextOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) item: u32,
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) glyphIndex: u32) -> TextOut {
  let glyph = textLayout.$.glyphs[glyphIndex];
  let item = textLayout.$.items[glyph.item];
  // Two triangles: corners (0,0) (1,0) (0,1), (0,1) (1,0) (1,1).
  let cx = f32((0x32u >> vertexIndex) & 1u);
  let cy = f32((0x2Cu >> vertexIndex) & 1u);
  let x = mix(glyph.quad.x, glyph.quad.z, cx);
  let y = mix(glyph.quad.y, glyph.quad.w, cy);
  let world = item.origin.xyz + item.right.xyz * x + item.up.xyz * y;
  var out: TextOut;
  out.position = frameLayout.$.frame.viewProj * vec4f(world, 1.0);
  // The atlas's v runs down: the quad's top (cy = 1) is the glyph's top row.
  out.uv = vec2f(mix(glyph.uv.x, glyph.uv.z, cx), mix(glyph.uv.w, glyph.uv.y, cy));
  out.item = glyph.item;
  return out;
}

@fragment
fn fs(in: TextOut) -> @location(0) vec4f {
  let item = textLayout.$.items[in.item];
  let distance = textureSample(textLayout.$.atlas, textLayout.$.linear, in.uv).r;
  // One screen pixel of distance: the edge's anti-aliasing ramp.
  let ramp = max(fwidth(distance), 1e-4);
  let fill = clamp((distance - 0.5) / ramp + 0.5, 0.0, 1.0);
  let body = clamp((distance - 0.5 + item.outline.w) / ramp + 0.5, 0.0, 1.0);
  let light = item.color.rgb + item.emissive.rgb * frameLayout.$.frame.debug.x;
  let coverage = body * item.origin.w;
  return vec4f(mix(item.outline.rgb, light, fill) * coverage, coverage);
}
`;

export const TEXT_PIPELINE = {
  label: "text",
  layouts: [frameLayout, textLayout],
  template,
  externals: { frameLayout, textLayout },
  sampleCount: SAMPLE_COUNT,
  depthStencil: DEPTH.readOnly,
  cullMode: "none",
  fragment: { entryPoint: "fs", targets: [{ format: HDR_FORMAT, blend: TEXT_BLEND }] },
} satisfies PipelineSpec;

export function createTextPipeline(root: TgpuRoot): Promise<GPURenderPipeline> {
  return createPipeline(root, TEXT_PIPELINE);
}

const ITEM_FLOATS = TEXT_ITEM_BYTES / 4;
const GLYPH_FLOATS = TEXT_GLYPH_BYTES / 4;
/** The widest outline a distance field of `SDF_RADIUS` can draw, in its units. */
const MAX_OUTLINE = 0.45;

/** A text's outline width, em, in distance-field units (0.5 spans `SDF_RADIUS` texels). */
export function outlineUnits(widthEm: number): number {
  return Math.min(MAX_OUTLINE, (widthEm * EM_PX) / (2 * SDF_RADIUS));
}

const scratch = {
  right: [0, 0, 0] as Vec3,
  up: [0, 0, 0] as Vec3,
  normal: [0, 0, 0] as Vec3,
  origin: [0, 0, 0] as Vec3,
  corner: [0, 0, 0] as Vec3,
};
const projected = createProjected();

export class TextPacker {
  readonly items: readonly SceneText[];
  /** `TextItem` records, one per text, repacked every frame. */
  readonly itemData: Float32Array<ArrayBuffer>;
  /** `TextGlyph` records; grows (rarely) when the texts need more room. */
  glyphData: Float32Array<ArrayBuffer>;
  glyphU32: Uint32Array<ArrayBuffer>;
  /** Glyphs laid out now, over every text. */
  glyphCount = 0;
  #parts = new Map<string, Part>();
  #look: LookConfig;
  #atlas: Pick<GlyphAtlas, "font">;
  /** Each text's style and font as last laid out. */
  #styles: TextStyleLook[];
  #fonts: Font[];
  #laidOut: { text: string | null; style: string }[];
  #boxes: TextBox[];
  /** Each text's size this frame after `maxWidth`, metres per em. */
  #scale: Float64Array;
  #rects: TextRect[];
  /** The yielding texts kept this frame, by index, in claim order. */
  #kept: Int32Array;

  constructor(scene: SceneDesc, look: LookConfig, atlas: Pick<GlyphAtlas, "font">) {
    this.items = scene.text ?? [];
    this.#look = look;
    this.#atlas = atlas;
    const n = Math.max(1, this.items.length);
    this.itemData = new Float32Array(n * ITEM_FLOATS);
    this.glyphData = new Float32Array(256 * GLYPH_FLOATS);
    this.glyphU32 = new Uint32Array(this.glyphData.buffer);
    for (const part of scene.parts) this.#parts.set(part.id, part);
    this.#styles = this.items.map((item) => this.#style(item));
    this.#fonts = this.#styles.map((style) => atlas.font(style));
    this.#laidOut = this.items.map((item) => ({ text: null, style: item.style }));
    this.#boxes = this.items.map(() => createTextBox());
    this.#scale = new Float64Array(this.items.length);
    this.#rects = this.items.map((item) => ({ id: item.id, x: 0, y: 0, width: 0, height: 0 }));
    this.#kept = new Int32Array(this.items.length);
  }

  #style(item: SceneText): TextStyleLook {
    const style = this.#look.text[item.style];
    if (!style) throw new Error(`text: ${item.id} uses unknown style "${item.style}"`);
    return style;
  }

  /** Lays every text out again if any text or style changed; returns whether glyphs changed. */
  layout(): boolean {
    let changed = false;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const was = this.#laidOut[i]!;
      if (item.text !== was.text || item.style !== was.style) changed = true;
    }
    if (!changed) return false;
    let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const was = this.#laidOut[i]!;
      if (item.style !== was.style) {
        this.#styles[i] = this.#style(item);
        this.#fonts[i] = this.#atlas.font(this.#styles[i]!);
        was.style = item.style;
      }
      was.text = item.text;
      // Room for every character (an upper bound on its glyphs) before laying it out.
      this.#reserve(count + item.text.length);
      const box = layoutText(
        item.text,
        this.#fonts[i]!,
        item.align[0],
        item.align[1],
        this.glyphData,
        count * GLYPH_FLOATS,
        GLYPH_FLOATS,
        item.text.length,
        this.#boxes[i]!,
      );
      for (let g = 0; g < box.count; g++)
        this.glyphU32[(count + g) * GLYPH_FLOATS + GLYPH_QUAD_FLOATS] = i;
      count += box.count;
    }
    this.glyphCount = count;
    return true;
  }

  #reserve(glyphs: number): void {
    if (glyphs * GLYPH_FLOATS <= this.glyphData.length) return;
    let size = this.glyphData.length / GLYPH_FLOATS;
    while (size < glyphs) size *= 2;
    const grown = new Float32Array(size * GLYPH_FLOATS);
    grown.set(this.glyphData);
    this.glyphData = grown;
    this.glyphU32 = new Uint32Array(grown.buffer);
  }

  /**
   * Packs every text's placement for this frame's parts and `camera`. A yielding text whose
   * screen box overlaps an earlier yielding text's is hidden this frame.
   */
  place(camera: CameraMatrices): void {
    const { right, up, normal, origin } = scratch;
    let kept = 0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const o = i * ITEM_FLOATS;
      const out = this.itemData;
      const box = this.#boxes[i]!;
      const part = this.#parts.get(item.part);
      if (!part) throw new Error(`text: ${item.id} names unknown part "${item.part}"`);
      const opacity = item.opacity ?? 1;
      let scale = item.size;
      if (item.maxWidth !== undefined && box.width * scale > item.maxWidth)
        scale = item.maxWidth / box.width;
      if (box.count === 0 || !(opacity > 0)) scale = 0;
      faceBasis(item.face, part.transform, camera.view, right, up, normal);
      vec3.transformMat4(origin, item.local, part.transform);
      vec3.scaleAndAdd(origin, origin, normal, item.lift);
      const style = this.#styles[i]!;
      out[o] = origin[0];
      out[o + 1] = origin[1];
      out[o + 2] = origin[2];
      out[o + 3] = Math.min(1, opacity);
      for (let a = 0; a < 3; a++) {
        out[o + 4 + a] = right[a]! * scale;
        out[o + 8 + a] = up[a]! * scale;
        out[o + 12 + a] = style.color[a]!;
        out[o + 16 + a] = style.emissive[a]!;
        out[o + 20 + a] = style.outline.color[a]!;
      }
      out[o + 7] = 0;
      out[o + 11] = 0;
      out[o + 15] = 0;
      out[o + 19] = 0;
      out[o + 23] = outlineUnits(style.outline.width);
      this.#scale[i] = scale;
      if (!item.yields || scale === 0) continue;
      // Crowded words: the first to claim its room keeps it.
      const rect = this.#rects[i]!;
      let clash = !this.#screenBox(i, camera, rect);
      for (let k = 0; k < kept && !clash; k++) clash = overlaps(rect, this.#rects[this.#kept[k]!]!);
      if (clash) {
        this.#scale[i] = 0;
        for (let a = 4; a < 11; a++) out[o + a] = 0;
      } else this.#kept[kept++] = i;
    }
  }

  /** Writes text `i`'s screen box through `camera` into `rect`; false if it is behind the eye. */
  #screenBox(i: number, camera: CameraMatrices, rect: TextRect): boolean {
    const { corner } = scratch;
    const o = i * ITEM_FLOATS;
    const d = this.itemData;
    const box = this.#boxes[i]!;
    const descent = this.#fonts[i]!.metrics.descent;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let c = 0; c < 4; c++) {
      const x = box.left + (c & 1 ? box.width : 0);
      const y = c & 2 ? box.top : box.top - box.height - descent;
      for (let a = 0; a < 3; a++) corner[a] = d[o + a]! + d[o + 4 + a]! * x + d[o + 8 + a]! * y;
      project(camera, corner, projected);
      if (projected.behind) return false;
      minX = Math.min(minX, projected.x);
      minY = Math.min(minY, projected.y);
      maxX = Math.max(maxX, projected.x);
      maxY = Math.max(maxY, projected.y);
    }
    rect.x = minX;
    rect.y = minY;
    rect.width = maxX - minX;
    rect.height = maxY - minY;
    return true;
  }

  /** Screen boxes of the texts as last placed (see `Renderer.textRects`). */
  rects(camera: CameraMatrices, out: TextRect[]): TextRect[] {
    out.length = 0;
    for (let i = 0; i < this.items.length; i++) {
      const rect = this.#rects[i]!;
      if (this.#scale[i] !== 0 && this.#screenBox(i, camera, rect)) out.push(rect);
    }
    return out;
  }
}

/** Screen boxes that touch, or come within 2 px side to side (words need air to read). */
function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return (
    a.x < b.x + b.width + 2 &&
    b.x < a.x + a.width + 2 &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}
