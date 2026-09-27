# 17 — Model lab II: MLP, residual, full (GQA), quantized, drafter, MoE

**Milestone:** M3 · **Depends on:** 16 · **Visual:** none new (reuses `/lab/models`)

## Contract

Every remaining model exists, is probed and is exported before any chapter art
for chapters 6–14. Each one carries measured evidence for its chapter.

## Seam

All configs are **invented starting points**, with the same bounded-retry rule as slice 16.

- **`mlp`:** `attn` plus RoPE, `mlp: swiglu (hidden 4×)`, `residual: true`, `norm: none`, 1 layer.
  - Probe (chapter 6): per-neuron contribution. For the top-activating neurons on a fact-like prompt set ("the sky is **_", "a cat says _**"), ablating the MLP drops the correct-token probability by ≥ 30% relative.
  - The copy says "a lot of what the model knows is stored here", never "facts live here".
- **`noresidual`** and **`residual`:** both are 4 layers with RoPE and SwiGLU. `noresidual` has `residual: false` and `norm: none`; `residual` has `residual: true` and `norm: rmsnorm`.
  - Probe (chapter 7): val loss for `residual` is at least 10% lower than for `noresidual`, _and_ the last-layer residual-norm trace shows the signal preserved. The chapter shows both models (its visible failure).
- **`full`:** the target the ladder builds up to. 4 layers, `nHeads: 4`, `nKvHeads: 2` (**GQA**, D36), `dModel: 128–256`, `ctx: 256`.
  - Probes (chapter 8):
    - Coherent continuation, measured as val loss plus a 20-prompt continuation sample committed as evidence text.
    - Heads differ: the attention-pattern distance between heads is above a threshold.
  - Budget: ≤ 50 ms per token on CPU (slice 15's gate).
- **`full-q8`:** made by `training/quantize.py` from `full`, symmetric int8 per group of 32. It is stored as `q8_0` tensors, and `packages/llm/src/quantize.ts` dequantizes them.
  - Probe (chapter 12): top-1 agreement and KL divergence against `full` on the validation prompts, and the byte ratio.
- **`drafter` candidates:** 1-layer full-architecture models at `dModel` 64 and 96 (D26).
  - Probe (chapter 13): the acceptance rate α when drafting for `full` with k=4, using the Leviathan rule, on validation prompts.
  - This slice picks the drafter with the best α for its size (**O3, provisional**; slice 33 finalises it).
- **`moe`:** the `full` shape with `mlp: moe (8 experts, top-2)`. Training adds the Switch auxiliary loss `α·N·Σ fᵢPᵢ` with α = 1e-2.
  - **Export gate:** the entropy of expert usage on held-out tokens must be ≥ 0.9·log 8, otherwise the export fails.
  - Probe (chapter 14): the distribution of expert usage, plus any token-type pattern the router shows. Record it as measured only; no specialisation claims.

## Playable

`/lab/models` for every model. `bun packages/llm/cli.ts speculate --draft drafter-64 --target full "once upon a"` prints the accepted and rejected tokens.

## Verify

- A trained-model parity fixture per model (TypeScript vs torch, 1e-3).
- For `q8_0`: TypeScript dequantization matches Python bit for bit.
- The MoE export gate is enforced by a test that feeds a collapsed router fixture and expects it to fail.
- Every manifest has `evidence`, and every probe is recorded with pass or fail.
- Total model bytes for the whole ladder are ≤ 25 MB. Record the actual total here.

## Resolves

- **O2** evidence for chapters 6–14.
- **O3** (provisional).
- Map card 6 (router collapse).

## Delegated

Everything within the bounded-retry rule and the size budgets.

## Stays green

01–16.

## Feedback that would change this slice

A probe failure. Apply D33 and note it for the human.
