// The one CPU forward pass (D9: no GPU inference). It mirrors training/model.py and
// is pinned to it by the parity fixtures. Weights are f32; sums accumulate in f64.
//
// Per layer, with `norm(x)` the identity when norm is "none":
//   attention:  x ← [x +] wo · attend(rope(wq·norm(x)), rope(wk·norm(x)), wv·norm(x))
//   mlp:        x ← [x +] w2 · (silu(w1·norm(x)) ⊙ w3·norm(x))     (or the MoE mix)
// then logits = lm_head · norm(x) at the last position.
//
// Attention sums its keys in a canonical order (highest score first), so the result
// is a function of the set of (score, value) pairs. Without positions, shuffling the
// earlier tokens therefore leaves the output bit-identical (D35).
import type { SwigluWeights, Transformer } from "./transformer.ts";

/** Which values to record; an omitted list means all of them. */
export interface TraceSpec {
  /** Indices into this call's `tokens`. */
  tokens?: number[];
  /** Query heads. */
  heads?: number[];
  layers?: number[];
}

/** A row-major tensor of recorded values. */
export interface TraceTensor {
  shape: number[];
  data: Float32Array;
}

/** Around one residual add. Shapes `[tokens, dModel]`; `rms` is `[tokens]`. */
export interface ResidualTrace {
  /** The stream entering the block. */
  residualIn: TraceTensor;
  /** What the block computed. */
  branch: TraceTensor;
  /** The stream leaving the block: `residualIn + branch`, or `branch` without residuals. */
  sum: TraceTensor;
  /** Root mean square of `residualIn` per token (what RMSNorm divides by, before eps). */
  rms: TraceTensor;
}

/** Shapes `[tokens, heads, headDim]`, except scores and weights `[tokens, heads, keys]`. */
export interface AttentionTrace {
  /** Queries after RoPE, as the scores use them. */
  q: TraceTensor;
  /** Keys after RoPE, of the kv head each traced query head reads. */
  k: TraceTensor;
  v: TraceTensor;
  /** Queries and keys before RoPE rotated them. */
  rope?: { qBefore: TraceTensor; kBefore: TraceTensor };
  /** Scaled dot products over every cached and current position; masked keys are -Infinity. */
  scores: TraceTensor;
  weights: TraceTensor;
  /** The weighted sum of values per head, before `wo`. */
  mixed: TraceTensor;
}

export interface LayerTrace {
  attn?: AttentionTrace & { residual: ResidualTrace };
  /** SwiGLU: `gate = w1·x`, `up = w3·x`, `act = silu(gate) ⊙ up`, `down = w2·act`. */
  mlp?: { gate: TraceTensor; up: TraceTensor; act: TraceTensor; down: TraceTensor };
  /** MoE routing: `probs [tokens, experts]`, chosen `experts` and their `weights` `[tokens, topK]`. */
  router?: { probs: TraceTensor; experts: TraceTensor; weights: TraceTensor };
  /** Around the MLP or MoE block. */
  mlpResidual?: ResidualTrace;
}

export interface ForwardTrace {
  /** The traced call-relative token indices, heads and layers, in order. */
  tokens: number[];
  heads: number[];
  /** `layers[i]` is null for a layer that was not traced. */
  layers: (LayerTrace | null)[];
}

export interface ForwardResult {
  /** Next-token logits after the last token, `[vocab]`; with `allPositions`, after every
   * token of this call, `[tokens, vocab]`. */
  logits: Float32Array;
  trace?: ForwardTrace;
}

/** Keys and values of earlier positions, per layer, after RoPE. */
export interface KvCache {
  length: number;
  k: Float32Array[];
  v: Float32Array[];
}

export interface ForwardOptions {
  trace?: TraceSpec;
  /** Earlier positions; `forward` appends this call's keys and values to it. */
  kv?: KvCache;
  /** Sliding window: each position sees at most this many positions, itself included. */
  window?: number;
  /** Return logits after every token of this call (speculative decoding's verify step). */
  allPositions?: boolean;
}

export function createKvCache(model: Transformer): KvCache {
  const { ctx, nKvHeads, nLayers } = model.arch;
  const size = ctx * nKvHeads * model.headDim;
  return {
    length: 0,
    k: Array.from({ length: nLayers }, () => new Float32Array(size)),
    v: Array.from({ length: nLayers }, () => new Float32Array(size)),
  };
}

export function forward(
  model: Transformer,
  tokens: ArrayLike<number>,
  options: ForwardOptions = {},
): ForwardResult {
  const { arch, headDim: hd } = model;
  const { dModel: d, nHeads, nKvHeads, vocab } = arch;
  const T = tokens.length;
  const past = options.kv?.length ?? 0;
  const total = past + T;
  if (T === 0) throw new Error("forward needs at least one token");
  if (total > arch.ctx) throw new Error(`${total} positions exceed the context of ${arch.ctx}`);
  const window = options.window ?? Infinity;
  const group = nHeads / nKvHeads;

  const tracer = options.trace ? new Tracer(options.trace, T, nHeads, arch.nLayers) : undefined;

  const x = new Float32Array(T * d);
  for (let t = 0; t < T; t++) {
    const id = tokens[t]!;
    if (!(id >= 0 && id < vocab)) throw new Error(`token id ${id} is outside the vocabulary`);
    x.set(model.tokEmb.subarray(id * d, (id + 1) * d), t * d);
  }
  const h = new Float32Array(T * d);
  const branch = new Float32Array(T * d);
  // Attention scratch, sized for the longest key range.
  const scores = new Float64Array(total);
  const exps = new Float64Array(total);
  const acc = new Float64Array(model.headDim);

  for (let l = 0; l < arch.nLayers; l++) {
    const layer = model.layers[l]!;
    const lt = tracer?.layer(l);

    if (layer.attn) {
      const { wq, wk, wv, wo } = layer.attn;
      normRows(h, x, T, d, layer.attnNorm, arch.normEps);
      const q = matmulRows(wq, h, T, nHeads * hd, d);
      const k = matmulRows(wk, h, T, nKvHeads * hd, d);
      const v = matmulRows(wv, h, T, nKvHeads * hd, d);
      const rope = arch.positions === "rope";
      const qBefore = rope && lt ? q.slice() : undefined;
      const kBefore = rope && lt ? k.slice() : undefined;
      if (rope) {
        applyRope(q, T, nHeads, hd, past, arch.ropeTheta);
        applyRope(k, T, nKvHeads, hd, past, arch.ropeTheta);
      }

      // Keys and values of every visible position: the cache plus this call.
      const kvStride = nKvHeads * hd;
      let keys = k;
      let values = v;
      if (options.kv) {
        options.kv.k[l]!.set(k, past * kvStride);
        options.kv.v[l]!.set(v, past * kvStride);
        keys = options.kv.k[l]!;
        values = options.kv.v[l]!;
      }
      const keyBase = options.kv ? 0 : past; // position of row 0 in `keys`

      const mixed = new Float32Array(T * nHeads * hd);
      const traceScores = lt ? tracer!.attnScores(total) : undefined;
      const scale = 1 / Math.sqrt(hd);
      for (let t = 0; t < T; t++) {
        const pos = past + t;
        const first = Math.max(0, pos + 1 - window);
        for (let head = 0; head < nHeads; head++) {
          const kvHead = Math.floor(head / group);
          const qOff = (t * nHeads + head) * hd;
          let max = -Infinity;
          for (let j = first; j <= pos; j++) {
            const kOff = (j - keyBase) * kvStride + kvHead * hd;
            let dot = 0;
            for (let i = 0; i < hd; i++) dot += q[qOff + i]! * keys[kOff + i]!;
            const s = dot * scale;
            scores[j] = s;
            if (s > max) max = s;
          }
          const keyOrder = canonicalOrder(scores, first, pos);
          let sum = 0;
          for (const j of keyOrder) sum += exps[j] = Math.exp(scores[j]! - max);
          acc.fill(0);
          for (const j of keyOrder) {
            const w = exps[j]! / sum;
            const vOff = (j - keyBase) * kvStride + kvHead * hd;
            for (let i = 0; i < hd; i++) acc[i]! += w * values[vOff + i]!;
          }
          mixed.set(acc, qOff);
          traceScores?.record(t, head, first, pos, scores, exps, sum);
        }
      }
      matmulRowsInto(branch, wo, mixed, T, d, nHeads * hd);
      if (lt && tracer && traceScores) {
        lt.attn = {
          q: tracer.queryHeads(q, nHeads, hd),
          k: tracer.kvHeads(k, nKvHeads, hd, group),
          v: tracer.kvHeads(v, nKvHeads, hd, group),
          scores: traceScores.scores,
          weights: traceScores.weights,
          mixed: tracer.queryHeads(mixed, nHeads, hd),
          residual: tracer.residual(x, branch, d, arch.residual),
        };
        if (qBefore && kBefore) {
          lt.attn.rope = {
            qBefore: tracer.queryHeads(qBefore, nHeads, hd),
            kBefore: tracer.kvHeads(kBefore, nKvHeads, hd, group),
          };
        }
      }
      addResidual(x, branch, arch.residual);
    }

    if (layer.mlp || layer.moe) {
      normRows(h, x, T, d, layer.mlpNorm, arch.normEps);
      if (layer.mlp) {
        const parts = swiglu(layer.mlp, h, T, d, branch, lt !== undefined);
        if (lt && parts) lt.mlp = tracer!.mlp(parts, branch, d);
      } else {
        const routing = moe(layer.moe!, arch, h, T, d, branch);
        if (lt) lt.router = tracer!.router(routing);
      }
      if (lt) lt.mlpResidual = tracer!.residual(x, branch, d, arch.residual);
      addResidual(x, branch, arch.residual);
    }
  }

  const rows = options.allPositions ? T : 1;
  const final = new Float32Array(rows * d);
  normRows(final, x.subarray((T - rows) * d, T * d), rows, d, model.norm, arch.normEps);
  const logits = matmulRows(model.lmHead, final, rows, vocab, d);
  if (options.kv) options.kv.length = total;
  return tracer ? { logits, trace: tracer.result() } : { logits };
}

/** Key positions `first..last`, highest score first (ties by position). */
function canonicalOrder(scores: Float64Array, first: number, last: number): number[] {
  const order: number[] = [];
  for (let j = first; j <= last; j++) order.push(j);
  return order.sort((a, b) => scores[b]! - scores[a]! || a - b);
}

/** `out[t] = x[t] / sqrt(mean(x[t]²) + eps) · gain`, or a copy when there is no norm. */
export function normRows(
  out: Float32Array,
  x: Float32Array,
  rows: number,
  d: number,
  gain: Float32Array | undefined,
  eps: number,
): void {
  if (!gain) {
    out.set(x.subarray(0, rows * d));
    return;
  }
  for (let r = 0; r < rows; r++) {
    const off = r * d;
    let squares = 0;
    for (let i = 0; i < d; i++) squares += x[off + i]! * x[off + i]!;
    const inv = 1 / Math.sqrt(squares / d + eps);
    for (let i = 0; i < d; i++) out[off + i] = x[off + i]! * inv * gain[i]!;
  }
}

/** Each row of `x` (`[rows, cols]`) times `w` (`[outDim, cols]`), as `[rows, outDim]`. */
function matmulRows(
  w: Float32Array,
  x: Float32Array,
  rows: number,
  outDim: number,
  cols: number,
): Float32Array {
  const out = new Float32Array(rows * outDim);
  matmulRowsInto(out, w, x, rows, outDim, cols);
  return out;
}

function matmulRowsInto(
  out: Float32Array,
  w: Float32Array,
  x: Float32Array,
  rows: number,
  outDim: number,
  cols: number,
): void {
  for (let r = 0; r < rows; r++) {
    const xOff = r * cols;
    for (let o = 0; o < outDim; o++) {
      const wOff = o * cols;
      let sum = 0;
      for (let i = 0; i < cols; i++) sum += w[wOff + i]! * x[xOff + i]!;
      out[r * outDim + o] = sum;
    }
  }
}

/** Rotate interleaved pairs `(2i, 2i+1)` of each head by `pos · theta^(-2i/hd)`. */
export function applyRope(
  x: Float32Array,
  rows: number,
  heads: number,
  hd: number,
  firstPos: number,
  theta: number,
): void {
  for (let r = 0; r < rows; r++) {
    const pos = firstPos + r;
    for (let head = 0; head < heads; head++) {
      const off = (r * heads + head) * hd;
      for (let i = 0; i < hd / 2; i++) {
        const angle = pos * Math.pow(theta, (-2 * i) / hd);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const a = x[off + 2 * i]!;
        const b = x[off + 2 * i + 1]!;
        x[off + 2 * i] = a * cos - b * sin;
        x[off + 2 * i + 1] = a * sin + b * cos;
      }
    }
  }
}

function addResidual(x: Float32Array, branch: Float32Array, residual: boolean): void {
  if (residual) for (let i = 0; i < x.length; i++) x[i]! += branch[i]!;
  else x.set(branch);
}

interface SwigluParts {
  gate: Float32Array;
  up: Float32Array;
  act: Float32Array;
  hidden: number;
}

/** Writes `w2 · (silu(w1·h) ⊙ w3·h)` into `out`; returns the parts when asked to keep them. */
function swiglu(
  w: SwigluWeights,
  h: Float32Array,
  rows: number,
  d: number,
  out: Float32Array,
  keep: boolean,
): SwigluParts | undefined {
  const hidden = w.w1.length / d;
  const gate = matmulRows(w.w1, h, rows, hidden, d);
  const up = matmulRows(w.w3, h, rows, hidden, d);
  const act = new Float32Array(rows * hidden);
  for (let i = 0; i < act.length; i++) {
    const g = gate[i]!;
    act[i] = (g / (1 + Math.exp(-g))) * up[i]!;
  }
  matmulRowsInto(out, w.w2, act, rows, d, hidden);
  return keep ? { gate, up, act, hidden } : undefined;
}

interface Routing {
  probs: Float32Array;
  experts: Float32Array;
  weights: Float32Array;
  nExperts: number;
  topK: number;
}

/** Mixes each row's top-k experts, weighted by their renormalised router probabilities. */
function moe(
  w: NonNullable<Transformer["layers"][number]["moe"]>,
  arch: Transformer["arch"],
  h: Float32Array,
  rows: number,
  d: number,
  out: Float32Array,
): Routing {
  if (arch.mlp === "none" || arch.mlp.kind !== "moe") throw new Error("not an MoE arch");
  const { experts: nExperts, topK } = arch.mlp;
  const logits = matmulRows(w.router, h, rows, nExperts, d);
  const probs = new Float32Array(rows * nExperts);
  const experts = new Float32Array(rows * topK);
  const weights = new Float32Array(rows * topK);
  out.fill(0);
  const expertOut = new Float32Array(d);
  for (let r = 0; r < rows; r++) {
    const row = logits.subarray(r * nExperts, (r + 1) * nExperts);
    const p = softmax(row);
    probs.set(p, r * nExperts);
    const chosen = Array.from(p.keys())
      .sort((a, b) => p[b]! - p[a]! || a - b)
      .slice(0, topK);
    const mass = chosen.reduce((sum, e) => sum + p[e]!, 0);
    const hRow = h.subarray(r * d, (r + 1) * d);
    chosen.forEach((e, rank) => {
      const weight = p[e]! / mass;
      experts[r * topK + rank] = e;
      weights[r * topK + rank] = weight;
      swiglu(w.experts[e]!, hRow, 1, d, expertOut, false);
      for (let i = 0; i < d; i++) out[r * d + i]! += weight * expertOut[i]!;
    });
  }
  return { probs, experts, weights, nExperts, topK };
}

function softmax(logits: ArrayLike<number>): Float64Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]!);
  const out = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) sum += out[i] = Math.exp(logits[i]! - max);
  for (let i = 0; i < out.length; i++) out[i]! /= sum;
  return out;
}

/** Copies the requested tokens, heads and layers out of the working buffers. */
class Tracer {
  readonly tokens: number[];
  readonly heads: number[];
  private readonly layers: (LayerTrace | null)[];

  constructor(spec: TraceSpec, T: number, nHeads: number, nLayers: number) {
    const pick = (list: number[] | undefined, n: number, what: string) => {
      const all = Array.from({ length: n }, (_, i) => i);
      for (const i of list ?? []) if (!(i >= 0 && i < n)) throw new Error(`no ${what} ${i}`);
      return list ? [...list] : all;
    };
    this.tokens = pick(spec.tokens, T, "token");
    this.heads = pick(spec.heads, nHeads, "head");
    const layers = new Set(pick(spec.layers, nLayers, "layer"));
    this.layers = Array.from({ length: nLayers }, (_, l) => (layers.has(l) ? {} : null));
  }

  layer(l: number): LayerTrace | undefined {
    return this.layers[l] ?? undefined;
  }

  result(): ForwardTrace {
    return { tokens: this.tokens, heads: this.heads, layers: this.layers };
  }

  /** `[tokens, heads, hd]` from a `[T, nHeads, hd]` buffer. */
  queryHeads(buffer: Float32Array, nHeads: number, hd: number): TraceTensor {
    return this.headRows(buffer, nHeads, hd, (head) => head);
  }

  /** `[tokens, heads, hd]` of the kv head each traced query head reads, from `[T, nKvHeads, hd]`. */
  kvHeads(buffer: Float32Array, nKvHeads: number, hd: number, group: number): TraceTensor {
    return this.headRows(buffer, nKvHeads, hd, (head) => Math.floor(head / group));
  }

  private headRows(
    buffer: Float32Array,
    stride: number,
    hd: number,
    source: (head: number) => number,
  ): TraceTensor {
    const data = new Float32Array(this.tokens.length * this.heads.length * hd);
    let o = 0;
    for (const t of this.tokens) {
      for (const head of this.heads) {
        const off = (t * stride + source(head)) * hd;
        data.set(buffer.subarray(off, off + hd), o);
        o += hd;
      }
    }
    return { shape: [this.tokens.length, this.heads.length, hd], data };
  }

  attnScores(keys: number) {
    const shape = [this.tokens.length, this.heads.length, keys];
    const scores: TraceTensor = { shape, data: new Float32Array(shape[0]! * shape[1]! * keys) };
    const weights: TraceTensor = { shape, data: new Float32Array(scores.data.length) };
    scores.data.fill(-Infinity);
    const tokenRow = new Map(this.tokens.map((t, i) => [t, i]));
    const headCol = new Map(this.heads.map((head, i) => [head, i]));
    return {
      scores,
      weights,
      /** Records key positions `first..pos`: their scores and `exps[j] / sum` as weights. */
      record: (
        t: number,
        head: number,
        first: number,
        pos: number,
        rawScores: Float64Array,
        exps: Float64Array,
        sum: number,
      ) => {
        const ti = tokenRow.get(t);
        const hi = headCol.get(head);
        if (ti === undefined || hi === undefined) return;
        const off = (ti * this.heads.length + hi) * keys;
        for (let j = first; j <= pos; j++) {
          scores.data[off + j] = rawScores[j]!;
          weights.data[off + j] = exps[j]! / sum;
        }
      },
    };
  }

  residual(x: Float32Array, branch: Float32Array, d: number, residual: boolean): ResidualTrace {
    const rows = (buffer: Float32Array) => this.rows(buffer, d);
    const residualIn = rows(x);
    const branchT = rows(branch);
    const sum = { shape: residualIn.shape, data: residualIn.data.slice() };
    if (residual) for (let i = 0; i < sum.data.length; i++) sum.data[i]! += branchT.data[i]!;
    else sum.data.set(branchT.data);
    const rms = new Float32Array(this.tokens.length);
    this.tokens.forEach((_, i) => {
      let squares = 0;
      for (let j = 0; j < d; j++) squares += residualIn.data[i * d + j]! ** 2;
      rms[i] = Math.sqrt(squares / d);
    });
    return { residualIn, branch: branchT, sum, rms: { shape: [this.tokens.length], data: rms } };
  }

  mlp(parts: SwigluParts, down: Float32Array, d: number): NonNullable<LayerTrace["mlp"]> {
    return {
      gate: this.rows(parts.gate, parts.hidden),
      up: this.rows(parts.up, parts.hidden),
      act: this.rows(parts.act, parts.hidden),
      down: this.rows(down, d),
    };
  }

  router(routing: Routing): NonNullable<LayerTrace["router"]> {
    return {
      probs: this.rows(routing.probs, routing.nExperts),
      experts: this.rows(routing.experts, routing.topK),
      weights: this.rows(routing.weights, routing.topK),
    };
  }

  /** `[tokens, width]` from a `[T, width]` buffer. */
  private rows(buffer: Float32Array, width: number): TraceTensor {
    const data = new Float32Array(this.tokens.length * width);
    this.tokens.forEach((t, i) => data.set(buffer.subarray(t * width, (t + 1) * width), i * width));
    return { shape: [this.tokens.length, width], data };
  }
}
