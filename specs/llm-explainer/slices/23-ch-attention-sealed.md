# 23 — Chapter 4 · `attention` (b) — sealed pipes from the future

**Milestone:** M4 · **Depends on:** 22 · **Visual variable:** sealed-pipe legibility. The future pipes read as blocked, not missing or broken.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 4 · `attention` (b) is playable at `/#4`, backed by its real model and passing the template's checks.

## Model

`attn`.

## New kit primitive

SealedCap (a capped pipe stub)

## Loop beats (20–30 s)

Adds a beat after slice 22's: the words after the focus word appear with capped stubs. Caption: "you can't read tomorrow's newspaper."

## Notes and scope

Only the future tokens and caps are in scope.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the causal mask weights for future positions are exactly 0 in the trace, and that the caps render only for positions greater than the focus position.

## Delegated

Cap geometry.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
