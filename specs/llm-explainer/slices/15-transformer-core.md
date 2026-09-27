# 15 — Transformer core: forward pass, trace, sampling, worker

**Milestone:** M3 · **Depends on:** 14 · **Visual:** none

## Contract

There is one TypeScript forward pass whose architecture flags cover every model
in the ladder. It matches PyTorch on randomly initialised fixtures, **before**
any model is trained. It runs in a cancellable Web Worker (D38), and it exposes
the internal values the scenes draw.

## Seam

- **`packages/llm/src/manifest.ts`** gains `TransformerArch`:
  ```ts
  interface TransformerArch {
    dModel: number;
    nLayers: number;
    nHeads: number;
    nKvHeads: number;
    ctx: number;
    vocab: number;
    attention: "none" | "causal";
    positions: "none" | "rope";
    ropeTheta: number;
    mlp:
      | "none"
      | { kind: "swiglu"; hidden: number }
      | { kind: "moe"; experts: number; topK: number; hidden: number };
    norm: "none" | "rmsnorm";
    residual: boolean;
    tiedEmbeddings: boolean;
  }
  ```
  Canonical tensor names are `tok_emb`, `layers.{i}.attn.{wq,wk,wv,wo}`, `layers.{i}.mlp.{w1,w2,w3}`, `layers.{i}.moe.{router,experts.{e}.w1..w3}`, `layers.{i}.{attn_norm,mlp_norm}`, `norm`, and `lm_head`.
- **`packages/llm/src/forward.ts`:** `forward(model, tokens, { trace?: TraceSpec; kv?: KvCache; window?: number }): { logits: Float32Array; trace?: ForwardTrace }`.
  - `ForwardTrace.layers[i]` holds `{ q, k, v, scores, weights, mixed, rope?: { before, after }, residualIn, branch, sum, rms, mlp?: { gate, up, act, down }, router?: { probs, experts, weights } }`, limited to the tokens, heads and layers listed in `TraceSpec`.
  - With no trace requested, there are no extra allocations.
- **`packages/llm/src/sample.ts`:** `probabilities(logits, temperature)` (a stable softmax) and `sample(probs, rng)`. Temperature 0 means argmax.
- **`packages/llm/src/rng.ts`:** wraps pmndrs `math/random` in a seeded `Rng`. It is the only source of randomness.
- **`apps/explainer/src/runtime/session.ts`:** a Web Worker running `packages/llm`.
  - API: `load(modelId)`, `run(tokens, traceSpec) → Promise<ForwardResult>` and `cancel()`.
  - A result from a stale request is dropped.
  - Chapter 0's synchronous path moves into the worker here.
- **`training/model.py`:** the one PyTorch module with the same flags and tensor names. `training/export.py` handles `transformer` manifests.

## Playable

`bun packages/llm/cli.ts forward <fixture-manifest> "once upon a"` prints the top-5 next tokens and one attention row.

## Verify

- **Parity fixtures:** `training/fixtures/make_parity.py` writes, for each flag combination used by the ladder, a random-init model (d=16, 1–2 layers) plus torch reference logits and traces. The combinations are:
  - `attention` none / causal;
  - `positions` none / rope;
  - `mlp` none / swiglu / moe (top-2 of 4);
  - `norm` + `residual` off / on;
  - GQA with `nKvHeads = nHeads / 2`.

  The TypeScript logits and every traced value must match within max-abs 1e-3 in fp32 compute over fp16-stored weights.

- **Property tests:**
  - The causal mask puts zero weight on future tokens.
  - Attention rows sum to 1.
  - RoPE preserves vector norms.
  - The RoPE dot product depends only on the position offset.
  - RMSNorm output has RMS 1 (with the gain set to 1).
- **Positions probe property (D35):** for the fixture with `positions: 'none'` and `nLayers: 1`, shuffling the earlier tokens while keeping the last token fixed gives **bit-identical** last-position logits.
- **Worker test:** cancelling mid-run leaves no pending promise, and a stale result is dropped.
- **Performance:** CPU forward at the `full` size target (slice 17) on 128 tokens is logged here. The budget is ≤ 50 ms per token.

## Resolves

The risk that PyTorch and TypeScript disagree numerically (RoPE pairing convention, RMSNorm eps, SwiGLU gate order). It is caught here on random weights, before any training time is spent.

## Delegated

The matmul implementation (plain loops vs blocked; no WASM or SIMD unless the performance budget fails, in which case record it in the choices ledger), and the worker message encoding (transferable buffers).

## Stays green

01–14.

## Feedback that would change this slice

None expected.
