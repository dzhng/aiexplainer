# 32 — Chapter 12 · `quantization` — a lower-resolution photo

**Milestone:** M4 · **Depends on:** 17, 31 · **Visual variable:** value-resolution read. The weight strip visibly coarsens, and the output barely changes.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 12 · `quantization` is playable at `/#12`, backed by its real model and passing the template's checks.

## Model

`full` vs `full-q8`.

## New kit primitive

none new (the weight strip reuses blocks with a stepped texture)

## Loop beats (20–30 s)

1. A strip of real weights is shown at fp16 and then at int8 (stepped).
2. The crate size halves (bytes chip).
3. Both machines continue the same prompt, and top-1 agreement is shown (probe).
4. The Llama-3-8B chip shows weights at bf16 vs int8 (arith).
5. **Failure beat:** still one word per trip.

## Notes and scope

Scenarios: fp16, int8. The int4 option is not in v1.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the strip values equal the real tensor slice and its dequantized version, and that the agreement and KL chips equal the probe evidence.

## Delegated

Which tensor slice to show.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Results (2026-09-27)

- **Tensor slice (delegated):** `layers.0.attn.wq`, flat 0–31, exactly one q8_0 group, so the strip shows one scale and its 32 integers. The run carries `full`'s stored f16 values and `full-q8`'s `scale · q` (`weightSlice`, new in `packages/llm/src/quantize.ts`).
- **The strip barely changes at full size, honestly.** A weight moves at most half a step of 1/127 of its group's largest weight, which no bar can show. A **magnifier** draws the weight the rounding moves most against the 8-bit grid, zoomed ×30 (computed: one step's height over its height on the strip); its marker snaps onto a grid line as the loop rounds. This is the coarsening read; the bars are the "output barely changes" read.
- **Scenarios fp16 / int8 became the slider** (bytes per weight 2 → 1, played by the loop), because a `ScenarioDef` is a prompt. The HUD scenarios are the two prompts `full-q8/scenarios.json` chose (closest and farthest KL), citing `q8-kl`. On the loop's prompt ("…a big bird who", the farthest) both machines say " loved to fly. The bird": 6 of 6 words the same.
- **Crate:** the 8-bit crate's height is the measured `q8-bytes` ratio (53.2%); the Llama-3-8B chip is `weightBytes` at the slider (16.1 GB → 8.03 GB).
- **The KL chip read "0"**: format `num` rounded below 0.001 to nothing. `num` now writes values under 0.01 with three significant figures (0.000246).
- **The worker keeps every model it loads** (cached by manifest URL). `Session.continueText(model, text, count)` and `Session.weights(model, tensor, start, count)` name their model, so a chapter compares two models without reloading; `greedyContinue`/`continueText` live in `packages/llm/src/generate.ts`. `scripts/direct-session.ts` answers the same requests in-process.
- **Shots** (`throwaway/shots/32/`): `app-hero`, `app-t20`, `loop-strip`, `sweep-sheet`, `exploded`. Registry holds at 11 buffers / 77.7 MB across 10 round trips 12 → 11 → 12. Cutaway is left out (open boards: a section adds nothing).
