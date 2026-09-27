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
