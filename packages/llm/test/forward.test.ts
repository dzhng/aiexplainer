import { describe, expect, test } from "bun:test";
import {
  applyRope,
  createKvCache,
  fetchModel,
  forward,
  normRows,
  probabilities,
  sample,
  seededRng,
  transformerModel,
  type TraceTensor,
  type Transformer,
} from "../src/index.ts";

const parityDir = new URL("../../../training/fixtures/parity/", import.meta.url);
const FIXTURES = [
  "embed",
  "attn",
  "rope",
  "mlp",
  "mlp-only",
  "noresidual",
  "residual",
  "gqa",
  "moe",
];

interface Expected {
  shape: number[];
  data: (number | null)[];
}
interface Reference {
  tokens: number[];
  logits: number[];
  layers: Record<string, unknown>[];
}

async function fixture(name: string): Promise<{ model: Transformer; reference: Reference }> {
  const dir = new URL(`${name}/`, parityDir);
  const model = transformerModel(await fetchModel(new URL("manifest.json", dir)));
  const reference: Reference = await Bun.file(new URL("reference.json", dir)).json();
  return { model, reference };
}

function maxAbsDiff(actual: ArrayLike<number>, expected: ArrayLike<number | null>): number {
  expect(actual.length).toBe(expected.length);
  let worst = 0;
  for (let i = 0; i < actual.length; i++) {
    const e = expected[i];
    if (e === null) {
      expect(actual[i]).toBe(-Infinity);
      continue;
    }
    worst = Math.max(worst, Math.abs(actual[i]! - e!));
  }
  return worst;
}

/** Every tensor in the torch reference, compared with the same path in the TS trace. */
function compareTrace(actual: unknown, expected: unknown, path: string, out: string[]): void {
  if (expected && typeof expected === "object" && "shape" in expected && "data" in expected) {
    const e = expected as Expected;
    const a = actual as TraceTensor | undefined;
    if (!a) return void out.push(`${path}: missing`);
    if (String(a.shape) !== String(e.shape)) return void out.push(`${path}: shape [${a.shape}]`);
    const diff = maxAbsDiff(a.data, e.data);
    if (diff > 1e-3) out.push(`${path}: max abs diff ${diff}`);
    return;
  }
  for (const [key, value] of Object.entries(expected as object)) {
    compareTrace(
      (actual as Record<string, unknown> | undefined)?.[key],
      value,
      `${path}.${key}`,
      out,
    );
  }
}

describe("forward matches torch on random-init fixtures", () => {
  for (const name of FIXTURES) {
    test(name, async () => {
      const { model, reference } = await fixture(name);
      const { logits, trace } = forward(model, reference.tokens, { trace: {} });
      expect(maxAbsDiff(logits, reference.logits)).toBeLessThan(1e-3);
      const problems: string[] = [];
      reference.layers.forEach((layer, l) =>
        compareTrace(trace!.layers[l], layer, `layers.${l}`, problems),
      );
      expect(problems).toEqual([]);
    });
  }
});

describe("forward properties", () => {
  test("without a trace request there is no trace", async () => {
    const { model, reference } = await fixture("gqa");
    expect(forward(model, reference.tokens).trace).toBeUndefined();
  });

  test("a partial trace holds exactly the requested tokens, heads and layers", async () => {
    const { model, reference } = await fixture("gqa");
    const full = forward(model, reference.tokens, { trace: {} }).trace!;
    const part = forward(model, reference.tokens, {
      trace: { tokens: [3, 7], heads: [1], layers: [1] },
    }).trace!;
    expect(part.layers[0]).toBeNull();
    const hd = model.headDim;
    const weights = part.layers[1]!.attn!.weights;
    expect(weights.shape).toEqual([2, 1, reference.tokens.length]);
    const fullWeights = full.layers[1]!.attn!.weights;
    const row = (t: number) =>
      fullWeights.data.subarray((t * 4 + 1) * weights.shape[2]!, (t * 4 + 2) * weights.shape[2]!);
    expect(Array.from(weights.data.subarray(0, weights.shape[2]))).toEqual(Array.from(row(3)));
    expect(part.layers[1]!.attn!.q.shape).toEqual([2, 1, hd]);
  });

  test("the causal mask puts zero weight on future tokens, and rows sum to 1", async () => {
    const { model, reference } = await fixture("gqa");
    const T = reference.tokens.length;
    const { trace } = forward(model, reference.tokens, { trace: {} });
    for (const layer of trace!.layers) {
      const w = layer!.attn!.weights;
      for (let t = 0; t < T; t++) {
        for (let head = 0; head < w.shape[1]!; head++) {
          const row = w.data.subarray(
            (t * w.shape[1]! + head) * T,
            (t * w.shape[1]! + head + 1) * T,
          );
          expect(Array.from(row.subarray(t + 1)).every((x) => x === 0)).toBe(true);
          expect(Math.abs(row.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-6);
        }
      }
    }
  });

  test("a sliding window hides positions further back than the window", async () => {
    const { model, reference } = await fixture("gqa");
    const T = reference.tokens.length;
    const { trace, logits } = forward(model, reference.tokens, { trace: {}, window: 4 });
    const w = trace!.layers[0]!.attn!.weights;
    const last = w.data.subarray((T - 1) * 4 * T, (T - 1) * 4 * T + T);
    expect(Array.from(last.subarray(0, T - 4)).every((x) => x === 0)).toBe(true);
    expect(maxAbsDiff(logits, forward(model, reference.tokens).logits)).toBeGreaterThan(1e-3);
  });

  test("decoding one token at a time with a KV cache gives the same logits", async () => {
    const { model, reference } = await fixture("moe");
    const kv = createKvCache(model);
    let logits: ArrayLike<number> = [];
    for (const token of reference.tokens) logits = forward(model, [token], { kv }).logits;
    expect(kv.length).toBe(reference.tokens.length);
    expect(maxAbsDiff(logits, reference.logits)).toBeLessThan(1e-3);
  });

  test("RoPE preserves norms, and its dot product depends only on the position offset", () => {
    const rng = seededRng(5);
    const hd = 8;
    const vector = () => Float32Array.from({ length: hd }, () => rng() * 2 - 1);
    const rotated = (v: Float32Array, pos: number) => {
      const out = v.slice();
      applyRope(out, 1, 1, hd, pos, 10000);
      return out;
    };
    const norm = (v: Float32Array) => Math.hypot(...v);
    const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0);
    const q = vector();
    const k = vector();
    for (const pos of [1, 7, 100]) expect(norm(rotated(q, pos))).toBeCloseTo(norm(q), 5);
    const offset3 = [0, 5, 40].map((p) => dot(rotated(q, p + 3), rotated(k, p)));
    for (const value of offset3) expect(value).toBeCloseTo(offset3[0]!, 5);
    expect(dot(rotated(q, 4), rotated(k, 0))).not.toBeCloseTo(offset3[0]!, 3);
  });

  test("RMSNorm output has RMS 1 when its gain is 1", () => {
    const rng = seededRng(7);
    const d = 16;
    const rows = 5;
    const x = Float32Array.from(
      { length: rows * d },
      () => (rng() * 2 - 1) * 10 ** (rng() * 4 - 2),
    );
    const out = new Float32Array(rows * d);
    normRows(out, x, rows, d, new Float32Array(d).fill(1), 1e-5);
    for (let r = 0; r < rows; r++) {
      const row = out.subarray(r * d, (r + 1) * d);
      expect(Math.sqrt(row.reduce((s, v) => s + v * v, 0) / d)).toBeCloseTo(1, 3);
    }
  });

  test("D35: one attention layer without positions ignores the order of earlier tokens", async () => {
    const { model, reference } = await fixture("attn");
    expect(model.arch.nLayers).toBe(1);
    expect(model.arch.positions).toBe("none");
    const tokens = reference.tokens;
    const base = forward(model, tokens).logits;
    const rng = seededRng(35);
    for (let trial = 0; trial < 20; trial++) {
      const earlier = tokens.slice(0, -1);
      for (let i = earlier.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [earlier[i], earlier[j]] = [earlier[j]!, earlier[i]!];
      }
      const shuffled = forward(model, [...earlier, tokens.at(-1)!]).logits;
      expect(Buffer.from(shuffled.buffer).equals(Buffer.from(base.buffer))).toBe(true);
    }
    // With RoPE the same shuffle does change the prediction.
    const rope = await fixture("rope");
    const shuffled = [...tokens.slice(0, -1)].reverse().concat(tokens.at(-1)!);
    expect(
      maxAbsDiff(forward(rope.model, shuffled).logits, forward(rope.model, tokens).logits),
    ).toBeGreaterThan(1e-3);
  });
});

describe("sampling", () => {
  test("probabilities are a stable softmax, and temperature 0 is argmax", () => {
    const p = probabilities([1000, 1001, 999], 1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(p[1]! > p[0]! && p[0]! > p[2]!).toBe(true);
    expect(Array.from(probabilities([1, 3, 3], 0))).toEqual([0, 1, 0]);
    const hot = probabilities([1, 2, 3], 5);
    const cold = probabilities([1, 2, 3], 0.2);
    expect(cold[2]!).toBeGreaterThan(hot[2]!);
  });

  test("sample draws in proportion to the probabilities", () => {
    const rng = seededRng(3);
    const counts = [0, 0, 0];
    for (let i = 0; i < 20000; i++) counts[sample([0.2, 0, 0.8], rng)]!++;
    expect(counts[1]).toBe(0);
    expect(counts[0]! / 20000).toBeCloseTo(0.2, 1);
  });
});
