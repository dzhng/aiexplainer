# 22 — Chapter 4 · `attention` (a) — pipe width is the real attention weight

**Milestone:** M4 · **Depends on:** 13, 16 · **Visual variable:** width hierarchy. The widest pipe visibly lands on the referent, and widths track the real weights.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 4 · `attention` (a) is playable at `/#4`, backed by its real model and passing the template's checks.

## Model

`attn` (1 layer, no positions). The probe must have passed, or the chapter uses D33.

## New kit primitive

PipeNetwork (tubes from every earlier token to the focus token, radius from `widthScale`)

## Loop beats (20–30 s)

1. The sentence sits as blocks.
2. Pipes grow from each earlier word into the focus word.
3. Their widths settle to the real weights.
4. The water mix flows into the focus word.

## Notes and scope

The sealed pipes and the flow pulses are **out of scope** (slices 23 and 24); here pipes are static and there is no future. Target: compare-screenshots against `explore/directions.html` card 1 (form only, since the mock's widths are invented).

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the packed `widthScale` equals `trace.layers[0].weights[focus]` for the scenario prompt.
- A CPU mirror checks that the pipe radii in the packed buffer are in the same order as the weights.

## Delegated

The pipe curve shape and the mapping from weight to radius (linear or sqrt; record which).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
