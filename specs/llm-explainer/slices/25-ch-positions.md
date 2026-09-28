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

## Record (2026-09-27)

- **Scene:** chapter 4's scene (the same builder, `attentionScene({ dials: true })`) with a
  ClockDial (`kit/dial.ts`) standing on every word up to the focus. A dial is a dark face, a
  tick at twelve and a glowing hand.
- **Which pair drives the hand (delegated): pair 5, unscaled, not the slowest.**
  - Pair 5's real angle is position × 10000^(−10/96) = 0.3831 rad, about 22° a word.
  - A 13-token sentence therefore stays within one turn and needs no display scale, so the
    help panel has no scale to disclose.
  - The slowest pair (i = 47) turns 0.007° a word and would need a ~3000× scale.
- **Loop (24 s):**
  1. The `rope` model runs on chapter 4's order pair ("The dog chased the cat. Then the" /
     cat↔dog), with its own measured scenarios.
  2. The hands come round (1.6 s).
  3. The pipes open and the guess shows: “dog”, 32%.
  4. "dog" and "cat" light up with "3 places, 66° apart".
  5. The swap: the moving words carry their dials, and their hands turn to their new places.
  6. The pipes differ and the guess changes to “cat”, 30%. The note reads "the predictions
     differ by 7.45%": the run's own total variation, equal to the probe's per-prompt value
     to 1e-12.
  7. Failure beat (18 s): "the mix is only an average: nothing here thinks about what it
     gathered".
- **Tests** (`test/positions.test.ts`):
  - hand angles = position × θ, with θ from the manifest's ropeTheta and dModel/nHeads;
  - the TV shown equals the probe value and the model's own two distributions;
  - the pair shown is the swapped words.
- **Slider:** "Order shown" (0/1) picks which order typed text or a scenario pair shows.
  Scenarios are "first / second" pairs.
- **Known:** in the app, a single held shot at exactly t = 21 s did not show the note, while
  t = 23 s and the lab page at 21 s do. Not investigated further.
- **Unprimed critique, last round (open polish):**
  - The pair's angle is only written, not drawn (no arc).
  - The focus word's dial is washed out under its wide pipe and glow.
  - The pair caption crosses pipes.
  - The swap takes one frame at 1 fps.
  - The average-note hold (18–22 s) is static.
  - The hands unwind at the seam.
  - Dials have no back face.
  - It confirmed the hands visibly step by position.
