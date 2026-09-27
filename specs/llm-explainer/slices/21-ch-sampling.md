# 21 — Chapter 3 · `sampling` — loaded dice

**Milestone:** M4 · **Depends on:** 13, 16 · **Visual variable:** probability encoding. Face size reads as likelihood, and the temperature slider visibly flattens or sharpens the die.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 3 · `sampling` is playable at `/#3`, backed by its real model and passing the template's checks.

## Model

`embed` (output half).

## New kit primitive

LoadedDie (a die whose face sizes are probabilities; it tumbles and lands)

## Loop beats (20–30 s)

1. The current word's arrow is scored against every word's arrow, shown as a score bar strip.
2. The scores become die faces.
3. The die tumbles and lands.
4. The temperature slider demo runs cold → hot.
5. **Failure beat:** the model only ever looks at one word back ("it" can't know what it refers to).

## Notes and scope

Slider: temperature 0–2 (stat: entropy, this tiny model). Precisely line: dot product, then softmax, then sampling.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that face areas equal `probabilities(logits, T)` for the top-6, plus an "other" face.
- With a held seed, the landed face equals `sample()`.

## Delegated

The number of faces shown (top-6 plus other).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
