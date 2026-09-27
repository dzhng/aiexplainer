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

## Result (measured 2026-09-27)

Every model ran once; no bounded retry was needed. All use batch 64 × 256 tokens,
AdamW lr 3e-3, warmup and cosine decay, and the first 50M training tokens. The
figures below were measured on MPS with another MPS job sometimes running at the
same time, so the per-1k-step times are upper bounds.

| Model      | Shape                                       | Steps | s per 1k steps | Val loss | weights.bin |
| ---------- | ------------------------------------------- | ----- | -------------- | -------- | ----------- |
| mlp        | rope + SwiGLU 384, d96, 1 layer             | 4000  | 62             | 2.515    | 1,867,776   |
| noresidual | d96, 4 layers, SwiGLU, no residual/norm     | 5000  | 124            | 8.318    | 1,966,080   |
| residual   | the same, residual + RMSNorm                | 5000  | 215            | 1.904    | 1,967,808   |
| full       | d128, 4 layers, 4 heads / 2 kv (GQA)        | 8000  | 239            | 1.738    | 3,016,960   |
| full-q8    | `full` in q8_0                              | —     | —              | —        | 1,603,840   |
| drafter-64 | 1 layer, d64, 2 heads / 1 kv                | 4000  | 121            | 2.499    | 647,552     |
| drafter-96 | 1 layer, d96, 2 heads / 1 kv                | 4000  | 184            | 2.309    | 1,063,488   |
| moe        | `full` shape, 8 experts (hidden 128), top-2 | 8000  | 299            | 1.689    | 4,598,016   |

Slice 17 models use tied embeddings, apart from `mlp`, which follows `attn`/`rope`.
This keeps the ladder inside its budget: every model file together is
**22,982,551 bytes** out of 25 MB, and a bun test enforces the limit. `moe` is
4.6 MB, above slice 16's per-model 4 MB. That limit is scoped to slice 16's
models; this slice names only the ladder total.

**Probes.**

- **mlp** (chapter 6), on 30 fact prompts with single-token answers:
  - Switching off the 16 most active neurons drops the total p(answer) by 94.9%. **Pass** (0.3).
  - Switching off the whole MLP drops it by 99.3%.
  - The model gives the answer p ≥ 0.1 on 8 of the 30 prompts.
  - The first metric, the mean of per-prompt relative drops, measured 0.12 with the
    neurons off and −3.8 with the whole MLP off. It is dominated by prompts where the
    model never knew the answer (p ≈ 0.001), so it was replaced by the
    probability-weighted drop. Both are recorded here.
  - Examples: "Once upon a … time" (p 1.000 → 0.012) and "They lived happily ever … after".
- **residual / noresidual** (chapter 7):
  - The val loss ratio is 0.229. **Pass** (≤ 0.9).
  - `noresidual` never learns: its loss stays at ln 4096 = 8.318, which is uniform guessing.
  - Signal preserved (RMS of the last layer's stream ÷ RMS of the embeddings): 21.5 for `residual` (**pass**, 0.5) and exactly 0 for `noresidual`, where the signal dies (the visible failure).
  - A first signal metric, the cosine between the embedding and the top stream,
    measured 0.064 and 0.0. It was replaced by the residual-norm trace that the contract names.
- **full** (chapter 8):
  - Val loss is 1.738. **Pass** (≤ 2.3).
  - 20 continuations (temperature 0.8) are in `full/scenarios.json`.
  - The mean total variation between two heads' attention rows is 0.604. **Pass** (0.2).
  - CPU budget: 3.9 ms per decoded token at d=256 (slice 15), so d=128 is well inside 50 ms.
- **full-q8** (chapter 12), `training/quantize.py`, symmetric int8 per 32 values:
  - Top-1 agreement with `full` is 0.994. **Pass** (0.9).
  - KL(full ‖ q8) is 0.00025 nats. **Pass** (≤ 0.05).
  - The byte ratio is 0.532. **Pass** (≤ 0.6).
  - TypeScript dequantization matches Python bit for bit (fixture `training/fixtures/q8.json`).
- **drafters** (chapter 13): α is Leviathan's β = Σ min(p, q), averaged over 20×128
  validation positions at temperature 1. The expected speedup at k=4 is
  (1 − α⁵)/((1 − α)(c·4 + 1)), with c = the ratio of parameter counts.
  - `drafter-64`: α 0.595, c 0.215, speedup 1.23.
  - `drafter-96`: α 0.638, c 0.353, speedup 1.03.
  - **O3 (provisional): `drafter-64`**, the better speedup for its size.
  - The playable `bun packages/llm/cli.ts speculate --draft drafter-64 --target full "once upon a"`
    accepted 18 of 48 guesses and took 12 target passes for 30 tokens (seed 13).
- **moe** (chapter 14):
  - Routing entropy ÷ log 8 is 1.000 on held-out tokens. The export gate (≥ 0.9)
    passed, and a test feeds a collapsed router and expects the export to fail.
  - Every expert takes 11.8–13.2% of routing slots.
  - Per-expert token kinds are recorded in `moe/scenarios.json` as measured only. Every expert is mostly first choice for word starts (62–90%). Some lean toward punctuation ("." "," newline) and some toward articles.
  - No specialisation claim.

## Stays green

01–16.

## Feedback that would change this slice

A probe failure. Apply D33 and note it for the human.
