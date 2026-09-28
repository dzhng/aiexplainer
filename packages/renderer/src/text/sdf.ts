/**
 * Signed distance fields for glyphs, CPU only: a rasterised glyph's coverage becomes the
 * distance to its outline, so one small bitmap draws crisp letters at any size. Exact
 * Euclidean distance transform (Felzenszwalb & Huttenlocher 2012, "Distance Transforms of
 * Sampled Functions"), with the anti-aliased edge pixels placing the outline between pixels
 * (the approach of Mapbox's tiny-sdf).
 */

const INF = 1e20;

/** Scratch buffers for one bitmap size; reused across glyphs no larger than it. */
export class SdfScratch {
  outer: Float64Array;
  inner: Float64Array;
  f: Float64Array;
  d: Float64Array;
  v: Int32Array;
  z: Float64Array;

  constructor(readonly capacity: number) {
    this.outer = new Float64Array(capacity * capacity);
    this.inner = new Float64Array(capacity * capacity);
    this.f = new Float64Array(capacity);
    this.d = new Float64Array(capacity);
    this.v = new Int32Array(capacity);
    this.z = new Float64Array(capacity + 1);
  }
}

/** The 1-D squared distance transform of `grid`'s line at `offset`, `stride` apart, in place. */
function edt1d(grid: Float64Array, offset: number, stride: number, n: number, s: SdfScratch) {
  const { f, d, v, z } = s;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset]!;
  for (let q = 1, k = 0; q < n; q++) {
    f[q] = grid[offset + q * stride]!;
    const q2 = q * q;
    let r = 0;
    let p = 0;
    do {
      r = v[k]!;
      p = (f[q]! - f[r]! + q2 - r * r) / (q - r) / 2;
    } while (p <= z[k]! && --k > -1);
    k++;
    v[k] = q;
    z[k] = p;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const r = v[k]!;
    d[q] = f[r]! + (q - r) * (q - r);
  }
  for (let q = 0; q < n; q++) grid[offset + q * stride] = d[q]!;
}

function edt2d(grid: Float64Array, width: number, height: number, s: SdfScratch) {
  for (let x = 0; x < width; x++) edt1d(grid, x, width, height, s);
  for (let y = 0; y < height; y++) edt1d(grid, y * width, 1, width, s);
}

/**
 * Writes the signed distance field of `alpha` (coverage 0–255, `width`×`height`, row-major)
 * into `out` as unorm bytes: 0.5 (128) on the outline, rising inside, falling outside, with
 * one unit of 0–1 spanning `2 × radius` pixels of distance.
 */
export function signedDistance(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  radius: number,
  out: Uint8Array,
  scratch: SdfScratch,
): Uint8Array {
  if (width > scratch.capacity || height > scratch.capacity)
    throw new Error(`sdf: ${width}×${height} exceeds the scratch capacity ${scratch.capacity}`);
  const { outer, inner } = scratch;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const a = alpha[i]! / 255;
    if (a >= 1) {
      outer[i] = 0;
      inner[i] = INF;
    } else if (a <= 0) {
      outer[i] = INF;
      inner[i] = 0;
    } else {
      // A partly covered pixel: the outline crosses it, `0.5 - a` of a pixel from its centre.
      const d = 0.5 - a;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
    }
  }
  edt2d(outer, width, height, scratch);
  edt2d(inner, width, height, scratch);
  for (let i = 0; i < n; i++) {
    // Positive inside the glyph.
    const distance = Math.sqrt(inner[i]!) - Math.sqrt(outer[i]!);
    const v = 0.5 + distance / (2 * radius);
    out[i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  return out;
}
