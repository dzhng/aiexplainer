# 27 — Chapter 7 · `residual` — the river and the volume knob

**Milestone:** M4 · **Depends on:** 13, 17 · **Visual variable:** merge-path clarity. Stations visibly add to the river rather than replace it.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 7 · `residual` is playable at `/#7`, backed by its real model and passing the template's checks.

## Model

`noresidual` and `residual` (shown side by side via a scenario).

## New kit primitive

River (a translucent channel along the stack; each station pours in) and VolumeKnob

## Loop beats (20–30 s)

1. Scenario "no river": four stations in a row, the signal fades, and the prediction is poor (val-loss chip).
2. Scenario "river": each station pours in, the knob keeps the level steady, and the prediction is good.
3. **Failure beat:** one reader, and one pass through, isn't enough for real text.

## Notes and scope

River width comes from the trace `residualIn` norm per layer, and the knob angle comes from `rms`.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that river widths equal the traced norms and that the loss chips equal the manifest `valLoss` values.

## Delegated

River material within the glass token.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
