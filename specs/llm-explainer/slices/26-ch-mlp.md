# 26 — Chapter 6 · `mlp` — a panel of yes/no questions

**Milestone:** M4 · **Depends on:** 13, 17 · **Visual variable:** activation magnitude read. The lit lamps and their push onto the arrow are legible.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 6 · `mlp` is playable at `/#6`, backed by its real model and passing the template's checks.

## Model

`mlp`.

## New kit primitive

QuestionPanel (a grid of lamps, one per neuron, each lit by activation, with push arrows back to the token arrow)

## Loop beats (20–30 s)

1. The gathered arrow enters the panel.
2. The lamps for the top-activating neurons light up.
3. Each "yes" adds a push arrow.
4. The prediction improves (the probe's ablation delta is shown).
5. **Failure beat:** a longer machine without the river forgets the start (a teaser for chapter 7).

## Notes and scope

Show at most 24 lamps (the top contributors from the trace). Copy: "a lot of what the model knows is stored here". No invented neuron meanings.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the lamp intensities equal the trace `mlp.act` for the chosen neurons, and that the shown ablation delta equals the probe evidence.

## Delegated

Lamp grid layout.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
