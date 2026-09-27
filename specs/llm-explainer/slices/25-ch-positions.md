# 25 — Chapter 5 · `positions` — clock hands

**Milestone:** M4 · **Depends on:** 13, 16 · **Visual variable:** rotation readability. Hands visibly turn by position, and the angle between two hands reads as distance.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 5 · `positions` is playable at `/#5`, backed by its real model and passing the template's checks.

## Model

`rope`.

## New kit primitive

ClockDial (a dial on each token block with a hand turned by its position)

## Loop beats (20–30 s)

1. Replay chapter 4's shuffle.
2. Clock dials appear on the blocks and turn to each position.
3. The pipes now differ between the two orders, and the predictions differ (the probe's total variation).
4. Two hands are shown with their angle.
5. **Failure beat:** the attention mix is just averaged. Nothing "thinks about" the gathered information.

## Notes and scope

The displayed rotation is the real RoPE angle for the lowest-frequency pair, scaled for visibility; the help panel discloses the scale.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the hand angles equal `position × θ₀` from the manifest `ropeTheta` and dModel, and that the shown total variation equals the probe value.

## Delegated

Which frequency pair drives the hand (default: the slowest).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
