# 31 — Chapter 11 · `batching` — the bus

**Milestone:** M4 · **Depends on:** 18, 30 · **Visual variable:** batch occupancy read. One trip carries more passengers as the batch grows, and the throughput chip rises until the ridge, then flattens.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 11 · `batching` is playable at `/#11`, backed by its real model and passing the template's checks.

## Model

arithmetic only (D27), for Llama-3-8B on H100 SXM.

## New kit primitive

Bus (a Blender prop, `assets/blender/bus.py`, with seats that fill)

## Loop beats (20–30 s)

1. The weight crates load onto the bus (the memory trip).
2. With one passenger, the ceiling chip shows ≈ 208 tok/s.
3. The batch slider fills the seats and throughput rises.
4. At the ridge (~295) the bus is full and throughput flattens.
5. Scenario "prefill": the whole prompt boards at once.
6. **Failure beat:** the crates are heavy (a teaser for chapter 12).

## Notes and scope

Slider: batch 1–512. Every chip is `kind: 'arith'`.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the chips equal the `arith` outputs across the slider range, and that no chip references the clock.

## Delegated

Bus proportions.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
