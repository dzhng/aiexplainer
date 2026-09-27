# 18 — Production arithmetic

**Milestone:** M3 · **Depends on:** 03 · **Visual variable:** how prominent the scale label is on a stat chip

## Contract

Every "production scale" number on screen is computed from cited constants by
one pure module, and is labelled with its scale (D27, copy rules). Browser
timing is never shown as speed.

## Seam

- **`packages/llm/src/scale/data/llama-3-8b.json`**, each value with its source (https://huggingface.co/NousResearch/Meta-Llama-3-8B/raw/main/config.json):
  - `nLayers` 32, `nHeads` 32, `nKvHeads` 8, `hidden` 4096, `intermediate` 14336, `vocab` 128256, `ropeTheta` 500000, `maxPos` 8192;
  - `headDim` 128 (derived);
  - `params` 8.03e9 (**recompute** it from the shapes here and store the computed value).
- **`packages/llm/src/scale/data/h100-sxm.json`** (https://www.nvidia.com/en-us/data-center/h100/): 3.35e12 B/s, 989e12 dense BF16 FLOP/s (store the 1,979 figure with sparsity too, labelled as such), 80 GB.
- **`packages/llm/src/scale/arith.ts`**, all pure:
  - `kvBytesPerToken(cfg, bytesPerValue)`
  - `weightBytes(cfg, bytesPerParam)`
  - `decodeCeilingTokPerSec(cfg, gpu, batch, contextLen)`, which includes KV reads
  - `prefillSeconds(cfg, gpu, tokens)`
  - `ridge(gpu)`
  - `batchThroughput(cfg, gpu, batch, contextLen)`
  - `specExpectedTokens(alpha, k) = (1 − α^(k+1)) / (1 − α)`
  - `maxBatchByMemory(cfg, gpu, contextLen)`
  - `moeActiveParams(total, experts, topK)`, which needs named assumptions
- **`StatChip.value.kind: 'arith'`** resolves through a registry of these functions. Chapters can't hand-type a number (slice 03).
- **Lint-level test:** no chapter stat or HUD string derives from `performance.now`. Only `clock.ts` may call it (slice 01).

## Playable

`/lab/arith`: a table of every function over sweeps of batch, context and precision, with the sources.

## Verify

- `kvBytesPerToken(llama3_8b, 2) === 131072` (128 KiB).
- `weightBytes` at bf16 ≈ 16.06e9.
- The batch-1 decode ceiling is ≈ 208 tok/s at short context.
- `ridge(h100) ≈ 295`.
- `specExpectedTokens` checked against Leviathan et al. 2023 (https://arxiv.org/abs/2211.17192), Equation (1) in §3.1, read from the PDF (see Results).
- Dimensional tests: bytes and seconds never mix, and throughput rises with batch until the ridge, then flattens.
- **Shot:** the stat-chip specimen on `/lab/tokens`, for each scale label.
  - **Variable:** scale-label prominence. The scale must be legible and must not be mistaken for the value.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.

## Resolves

- **O4** (H100 SXM).
- Confirm-list items: the Llama-3-8B config recomputation and the H100 specs.

## Delegated

Number formatting and units display.

## Stays green

01–03 (it can run in parallel with M1 and M2).

## Feedback that would change this slice

Wanting a different reference GPU (e.g. B200). That is a data-file swap.

## Results (implementation)

- **Config recomputed** from the fetched `config.json` (2026-09-27): all eight spec values match;
  `tie_word_embeddings` is false. `paramsFromShapes()` = **8,030,261,248** (stored).
- **H100 SXM** (spec sheet, 2026-09-27): 3.35 TB/s, 80 GB, BF16 1,979 TFLOPS footnoted "with
  sparsity"; dense stored as 989e12 (half). **O4 confirmed.**
- **Verified numbers:** KV = 131,072 B/token (bf16); weights = 16,060,522,496 B (bf16); batch-1
  decode ceiling = 208.4 tok/s at 128 context (208.6 at 1); ridge = 295.2 FLOP/B; max batch at
  8192 context = 59 (bf16).
- **Speculative decoding: the formula is Equation (1), not Theorem 3.8.** Read from the v2 PDF
  (§3.1): E(# generated tokens) = (1 − α^(γ+1)) / (1 − α), γ = drafted tokens. Theorem 3.8 is the
  walltime improvement factor (1 − α^(γ+1)) / ((1 − α)(γc + 1)), which uses Equation (1).
- **Model:** a roofline. A step costs max(bytes ÷ bandwidth, FLOPs ÷ dense FLOP/s). FLOPs per token
  = 2 × matmul params (all but the input-embedding lookup) + 4 × layers × heads × head size ×
  context. Every speed is a ceiling.
- **Scale-label shot deferred to slice 04** (the stat chip doesn't exist yet); it is on 04's Verify list.
- **The `performance.now` lint** is slice 01's `only clock.ts reads the wall clock` test. It
  already scans `apps/explainer/src` and `packages`, which includes `scale/` and `chapters/`.
- **`StatChip.format` gains `"s"`** (shown as ms below 1 s) so `prefillSeconds` can reach a chip. `validateChapter` now checks an arith stat: the function exists, its arguments match exactly, and its declared scale and unit fit the chip. Pure-math results (`specExpectedTokens`, `ridge`) have no fixed scale.
- **Formatting (delegated):** three significant figures, en-US grouping, SI decimal bytes ("131 kB", "16.1 GB") to match the spec sheet's "80 GB". So the precise copy says 128 KiB, and the chip says 131 kB.
