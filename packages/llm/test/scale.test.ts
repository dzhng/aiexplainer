import { describe, expect, test } from "bun:test";
import {
  ARITH,
  BF16,
  H100_SXM,
  LLAMA_3_8B,
  arithProblems,
  batchThroughput,
  computeBoundBatch,
  decodeCeilingTokPerSec,
  decodeStepSeconds,
  evalArith,
  flopsPerToken,
  kvBytesPerToken,
  llamaAsMoe,
  matmulParams,
  maxBatchByMemory,
  moeActiveParams,
  paramsFromShapes,
  prefillSeconds,
  ridge,
  specExpectedTokens,
  weightBytes,
  type ArithFnName,
  type Bytes,
  type Seconds,
  type TokensPerSec,
} from "../src/index.ts";

const cfg = LLAMA_3_8B;
const gpu = H100_SXM;

describe("Llama-3-8B constants", () => {
  test("params are recomputed from the layer shapes and stored as computed", () => {
    expect(paramsFromShapes(cfg)).toBe(8_030_261_248);
    expect(cfg.params).toBe(paramsFromShapes(cfg));
  });

  test("the head size is derived from the config", () => {
    expect(cfg.headDim).toBe(cfg.hidden / cfg.nHeads);
  });
});

describe("the slice 18 reference numbers", () => {
  test("KV cache is 128 KiB per token in bf16", () => {
    expect<number>(kvBytesPerToken(cfg, 2)).toBe(131_072);
  });

  test("bf16 weights are about 16.06 GB", () => {
    expect(weightBytes(cfg, 2) / 1e9).toBeCloseTo(16.06, 2);
  });

  test("the batch-1 decode ceiling at short context is about 208 tok/s", () => {
    const tokPerSec = decodeCeilingTokPerSec(cfg, gpu, 1, 128);
    expect(tokPerSec).toBeGreaterThan(208);
    expect(tokPerSec).toBeLessThan(209);
  });

  test("the H100 SXM ridge is about 295 FLOPs per byte", () => {
    expect(ridge(gpu)).toBeCloseTo(295.2, 1);
  });

  test("KV caches for 8192-token sequences fit 59 beside the bf16 weights in 80 GB", () => {
    expect(maxBatchByMemory(cfg, gpu, 8192)).toBe(59);
  });
});

describe("specExpectedTokens (Leviathan et al. 2023, Equation 1)", () => {
  // Tokens per run are a capped geometric variable: the accepted prefix plus one, at most k+1.
  const cappedGeometricMean = (alpha: number, k: number) => {
    let sum = 0;
    for (let i = 0; i <= k; i++) sum += alpha ** i;
    return sum;
  };

  test("matches the capped geometric mean it is derived from", () => {
    for (const alpha of [0, 0.3, 0.6, 0.8, 0.95])
      for (const k of [1, 2, 4, 8])
        expect(specExpectedTokens(alpha, k)).toBeCloseTo(cappedGeometricMean(alpha, k), 12);
  });

  test("never rejecting yields every draft plus the target's own token; always rejecting yields one", () => {
    expect(specExpectedTokens(1, 4)).toBe(5);
    expect(specExpectedTokens(1 - 1e-9, 4)).toBeCloseTo(5, 6);
    expect(specExpectedTokens(0, 4)).toBe(1);
  });
});

describe("dimensions", () => {
  test("bytes, seconds and rates do not mix", () => {
    // @ts-expect-error bytes are not seconds
    const wrong: Seconds = weightBytes(cfg, 2);
    // @ts-expect-error seconds are not a throughput
    const alsoWrong: TokensPerSec = prefillSeconds(cfg, gpu, 512);
    // @ts-expect-error a rate is not a size
    const size: Bytes = gpu.bandwidth;
    expect([wrong, alsoWrong, size].every(Number.isFinite)).toBe(true);
  });

  test("throughput rises with batch until the ridge, then flattens", () => {
    const ctx = 1; // short enough that KV reads don't move the knee
    const tp = (b: number) => batchThroughput(cfg, gpu, b, ctx);
    // Memory-bound: one read of the weights serves the whole batch, so throughput scales with it.
    expect(tp(64) / tp(1)).toBeGreaterThan(60);
    // Compute-bound: every extra sequence costs its own FLOPs, so throughput stops growing.
    const flat = gpu.flopsDense / flopsPerToken(cfg, ctx);
    expect(tp(2048)).toBeCloseTo(flat, 6);
    expect(tp(4096)).toBeCloseTo(flat, 6);
    // The knee sits where FLOPs per byte read reaches the ridge.
    const knee =
      (weightBytes(cfg, BF16.weightBytes) * gpu.flopsDense) /
      (gpu.bandwidth * 2 * matmulParams(cfg));
    expect(knee).toBeGreaterThan(ridge(gpu) / 2);
    expect(knee).toBeLessThan(ridge(gpu) * 2);
    expect(tp(Math.floor(knee * 0.9))).toBeLessThan(flat * 0.91);
    expect(tp(Math.ceil(knee * 1.1))).toBeCloseTo(flat, 6);
  });

  test("computeBoundBatch is the knee: memory-bound below it, flat throughput above it", () => {
    for (const ctx of [1, 16, 128]) {
      const knee = computeBoundBatch(cfg, gpu, ctx);
      const step = (b: number) => decodeStepSeconds(cfg, gpu, b, ctx);
      const tp = (b: number) => batchThroughput(cfg, gpu, b, ctx);
      // Below the knee a step is exactly the memory trip: the weights plus every KV cache.
      const b = Math.floor(knee * 0.9);
      const trip = (weightBytes(cfg, 2) + b * ctx * kvBytesPerToken(cfg, 2)) / gpu.bandwidth;
      expect(step(b)).toBeCloseTo(trip, 12);
      // At it the sums take as long as the bytes; past it throughput is the compute ceiling.
      const flat = gpu.flopsDense / flopsPerToken(cfg, ctx);
      expect(tp(knee)).toBeCloseTo(flat, 3);
      expect(tp(knee * 1.5)).toBeCloseTo(flat, 3);
      expect(tp(knee * 0.5)).toBeLessThan(flat * 0.6);
    }
    // A context so long that each sequence's KV reads outlast its sums never gets there.
    expect(computeBoundBatch(cfg, gpu, 1e7)).toBe(Infinity);
  });

  test("a long prompt is compute-bound: prefill costs its FLOPs, not its bytes", () => {
    const tokens = 2048;
    const byFlops = (2 * matmulParams(cfg) * tokens) / gpu.flopsDense;
    expect(prefillSeconds(cfg, gpu, tokens)).toBeGreaterThan(byFlops);
    expect(prefillSeconds(cfg, gpu, tokens)).toBeGreaterThan(weightBytes(cfg, 2) / gpu.bandwidth);
  });
});

describe("mixture of experts under a named assumption", () => {
  test("Llama-3-8B's MLPs as 8 experts, top 2: shared part plus two MLP copies", () => {
    const moe = llamaAsMoe(cfg, 8);
    const mlps = cfg.nLayers * 3 * cfg.hidden * cfg.intermediate;
    expect(moeActiveParams(moe.total, 8, 2, moe)).toBe(cfg.params + mlps);
    expect(moe.name).toContain("hypothetical");
  });

  test("one expert, chosen every time, is the dense model", () => {
    const moe = llamaAsMoe(cfg, 1);
    expect(moeActiveParams(moe.total, 1, 1, moe)).toBe(cfg.params);
  });
});

describe("the arithmetic registry", () => {
  const sample: Record<string, number> = {
    alpha: 0.8,
    k: 4,
    batch: 8,
    // Short enough that decode still reaches compute-bound (`computeBoundBatch` is finite).
    contextLen: 256,
    tokens: 512,
    weightBytes: 2,
    kvBytes: 2,
    experts: 8,
    topK: 2,
  };

  test("every entry evaluates to a finite number from its declared arguments", () => {
    for (const [fn, e] of Object.entries(ARITH)) {
      const args = Object.fromEntries(e.args.map((a) => [a, sample[a]!]));
      expect(Number.isFinite(evalArith(fn as ArithFnName, args))).toBe(true);
    }
  });

  test("entries agree with the functions they wrap", () => {
    expect(evalArith("kvBytesPerToken", { kvBytes: 2 })).toBe(131_072);
    expect(evalArith("specExpectedTokens", { alpha: 0.8, k: 4 })).toBe(specExpectedTokens(0.8, 4));
  });

  test("rejects unknown functions and missing or unexpected arguments", () => {
    expect(arithProblems("vibes", {})).toEqual(["unknown arithmetic function vibes"]);
    expect(arithProblems("kvBytesPerToken", {})).toEqual([
      "kvBytesPerToken: missing argument kvBytes",
    ]);
    expect(arithProblems("ridge", { batch: 1 })).toEqual(["ridge: unexpected argument batch"]);
    expect(() => evalArith("kvBytesPerToken", {})).toThrow();
  });
});
