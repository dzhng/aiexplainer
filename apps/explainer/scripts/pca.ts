/**
 * Principal component analysis of an embedding table, offline (bun only): the covariance of
 * the rows, then its eigenvectors by cyclic Jacobi rotations (exact for a small symmetric
 * matrix, no dependencies). Chapter 2's map is the table's shadow on its top 3 directions.
 */

interface Pca {
  /** Per-dimension mean of the fitted rows (subtracted before projecting). */
  mean: number[];
  /** Unit, mutually orthogonal directions, largest variance first. */
  components: number[][];
  /** Variance along each component. */
  variances: number[];
}

/** Row `i` of a `[rows, d]` table, as unit length when `unit`. */
export function row(table: ArrayLike<number>, d: number, i: number, unit: boolean): number[] {
  const out = Array.from({ length: d }, (_, k) => table[i * d + k]!);
  if (!unit) return out;
  const norm = Math.hypot(...out) || 1;
  return out.map((v) => v / norm);
}

/** The covariance of `rows` (each of length d) about their mean. */
function covariance(rows: number[][]): { mean: number[]; cov: number[][] } {
  const d = rows[0]!.length;
  const mean = Array.from(
    { length: d },
    (_, k) => rows.reduce((s, r) => s + r[k]!, 0) / rows.length,
  );
  const cov = Array.from({ length: d }, () => Array.from({ length: d }, () => 0));
  for (const r of rows)
    for (let a = 0; a < d; a++) {
      const da = r[a]! - mean[a]!;
      for (let b = a; b < d; b++) cov[a]![b]! += da * (r[b]! - mean[b]!);
    }
  for (let a = 0; a < d; a++)
    for (let b = a; b < d; b++) {
      cov[a]![b]! /= rows.length - 1;
      cov[b]![a] = cov[a]![b]!;
    }
  return { mean, cov };
}

/** Eigenvalues and eigenvectors (columns of `vectors`) of a symmetric matrix. */
function jacobiEigen(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  const a = matrix.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p]![q]! ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: a.map((r, i) => r[i]!), vectors: v };
}

/** The top `k` principal components of `rows`. Each component's sign is fixed (largest entry positive). */
export function pca(rows: number[][], k: number): Pca {
  const { mean, cov } = covariance(rows);
  const { values, vectors } = jacobiEigen(cov);
  const order = values.map((_, i) => i).sort((x, y) => values[y]! - values[x]!);
  const components = order.slice(0, k).map((i) => {
    const c = vectors.map((r) => r[i]!);
    const big = c.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    return big < 0 ? c.map((x) => -x) : c;
  });
  return { mean, components, variances: order.slice(0, k).map((i) => values[i]!) };
}
