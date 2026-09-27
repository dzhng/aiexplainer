# 16 — Model lab I: training harness and the risky early models

**Milestone:** M3 · **Depends on:** 15 · **Visual variable:** trace readability (the diagnostic table only)

## Contract

The training harness produces, measures and exports models on this Mac. The
three models whose chapter effects are most in doubt are trained and **probed**:
`embed`, `attn` and `rope`. No chapter art for chapters 2–5 starts until these
probes are recorded, whether they pass or are honestly failed (D25, D33).

## Seam

- **`training/train.py --config configs/<id>.toml`:**
  - Runs on MPS, with a fixed seed and AdamW with cosine decay.
  - Logs val loss, wall time and tokens seen, and writes them into the manifest.
  - Exports through `export.py` to `apps/explainer/public/models/<id>/`.
- **Configs** (starting points, **invented**; tune within the bounded retries below):
  - `embed`: embed → unembed, `nLayers: 0`, `dModel: 64`. This is the input half of chapter 2 and the model for chapter 3 (D37).
  - `attn`: 1 layer, `attention: causal`, `positions: none`, `mlp: none`, `residual: true`, `norm: none`, `nHeads: 1`, `dModel: 96` (D35).
  - `rope`: the same as `attn` with `positions: rope`.
- **`training/probes/`:** one probe per chapter effect. Each writes `ProbeResult` into its manifest's `evidence` and writes `scenarios.json` (the O2 prompts):
  - **`embed` / chapter 2 (neighbours):** the cosine rank of known pairs (cat/kitten, mom/dad, happy/glad) against random words.
  - **`embed` / chapter 3 (sampling):** the predicted next-token distribution is peaked for common contexts, and temperature changes its entropy.
  - **`attn` / chapter 4:** on a curated set of story prompts where a later pronoun or word refers back, the attention mass from the focus token onto the referent is compared with a uniform baseline. The effect passes if the mean ratio is ≥ 2.
  - **`rope` / chapter 5:** on pairs such as "the dog chased the cat" vs "the cat chased the dog" (same last token), the total variation between next-token distributions is exactly 0 for `attn` (D35) and ≥ 0.05 for `rope`.
- **Bounded retries:** at most **2** extra attempts per model, each changing only `dModel`, the step count or the data size. Record every attempt. If a probe still fails, the chapter follows D33.
- **`/lab/models`:** for any model and prompt, a table of top-5 next tokens, attention rows as a heatmap table, embedding neighbours, and each probe with pass or fail. It uses the production worker (slice 15).
- **MPS benchmark:** time per 1k steps and total wall time per config. Record them here and in the README research record.

## Playable

`/lab/models?model=attn&prompt=...` and `bun run training:train --config configs/attn.toml`.

## Verify

- **pytest:** the harness is deterministic (same seed, same first-100-step losses). Every exported manifest validates against the schema.
- **bun:** each exported model's TypeScript logits match torch on 20 validation prompts within 1e-3 (a trained-model parity fixture).
- **Probes:** recorded in `evidence` with pass or fail and the threshold.
- **Shot:** `/lab/models` for `attn` on a probe prompt.
  - **Variable:** trace-table readability only (a diagnostic surface, not product art).
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Size budget:** each exported model is ≤ 4 MB. Record the actual sizes.

## Resolves

- **O2** evidence for chapters 2–5.
- The MPS training-time unknown.

## Delegated

Optimiser hyperparameters, the curated probe prompt sets (committed, ≥ 30 prompts each, drawn from the validation split), and the data subset size.

## Stays green

01–15.

## Feedback that would change this slice

A probe failing after its retries. That triggers D33 copy and a human note in the README, not a silent downgrade.
