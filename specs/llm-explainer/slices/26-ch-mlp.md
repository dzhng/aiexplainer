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

## Record (2026-09-27, lane C)

- **Scene.** The word's arrow runs across the face of a `questionPanel` (new kit primitive:
  housing with a metal rim, a 6×4 lamp grid, one push pipe per lamp). Lamps light most active
  first; brightness is (|act| ÷ largest)^4, so the ranking reads. Pipes from the rows nearest
  the arrow drop straight; outer rows run down the column gutters, so no pipe crosses a lamp.
  The arrow is one piece per lamp column and thickens by the running sum of the pushes that
  have landed. It ends on the readout's first bar.
- **Numbers.** Every number comes from real `mlp` forward passes (`runtime/runs/mlp.ts`):
  - Lamps: the 24 most active neurons at the last token, using the trace's `mlp.act`.
  - Push: the drop in the answer's logit when that one neuron is off. Because this model has
    no norm and one layer, that drop equals act × (unembedding · w2 column) exactly, and a test
    checks it.
  - Readout: p(answer) with every lamp on (0.9996), then with the probe's 16 most active off
    (0.0124). 1 − off/on = 0.9876, the probe's own example value.
  - Chips: `mlpNeurons` 384 (model metric), `mlp-neurons` 94.9% (probe), and Llama-3-8B's
    14,336 (new arith `mlpNeurons`).
- **Failure beat (the chapter 7 teaser).** Four small panels in a row, nothing else. The arrow
  running through them is the `noresidual` model's real traced stream on the same text:
  1 → 7e-8 → 0. The note reads "arrow left: 0%".
- **Seams added.**
  - `forward` takes `mlpOff` (neuron ablation, the probe's hook).
  - The session's `run` takes an options object `{ trace, window, model, mlpOff }`. The
    worker holds every model it has loaded, keyed by id.
  - `createInference` is shared by the worker and `localSession` (tests and `scene-run.ts`).
  - `computeRun` dispatches per scene (`runtime/runs/<scene>.ts`) and takes the chapter's
    `LoadedModel`.
  - `placeSegment` and `UNIT_SEGMENT` are in the kit's tube module.
  - The tube occluder radius now ignores stretch along the path. It had been taking the
    largest axis scale, so a stretched pipe occluded everything.
  - `/lab/scene/<slug>?yaw=` offsets the camera for label sweeps, and the lab scene page now
    reports beats.
- **Shots** (`throwaway/shots/lanec/`): `kit-qp-sheet.png`, `mlp-hero-t12.png`, `app6.png`,
  `mlp-loop-strip.png`, `mlp-sweep-sheet.png`.
- **Critique round 1 (unprimed):**
  - Lamps read as uniform peach cards. Fix: lavender flow glow on dark lamps, with a steeper
    curve.
  - Pipes crossed lamps. Fix: gutter routing.
  - The arrow thickened in a single step. Fix: it now grows per column.
  - The arrow didn't meet the bar, and the point landed at 11 s with the counterfactual bar
    first. Fix: the on bar now comes at 7.2 s and the off bar at 9.6 s. The loop went from
    24 s to 22 s, and the dead holds are gone.
  - The teaser said "no river", which is jargon. Fix: it now reads "4 panels in a row,
    nothing else".
  - compare-screenshots found off-palette amber lamps and a flat panel. Fix: lavender lamps
    and the rim.
- **Critique round 2 (unprimed):**
  - Fixed after it:
    - The "without" beat changed nothing on the panel. Now the 16 most active lamps really
      switch off (their pipes retract and the arrow thins) while the second bar rises.
    - Gutter pipes all run left of their column, so there is no stray seventh rod.
    - Each bar stands in a glass track and no longer glows at t = 0.
    - Bloom is lower on the arrow and bars.
    - The legs are metal.
    - The teaser is shorter (about 5 s).
  - Open, accepted for now:
    - Among the 24 most active neurons the activation range is real but narrow (12 → 6.5).
      Even at contrast 4, the dimmest lit lamps never read as "off"; only the ablation beat
      shows dark lamps.
    - The main scene stays lit during the teaser.
    - Scene tags can collide with labels at side azimuths (90°).
    - The kit turntable has low contrast (navy on navy).
- **Human checkpoint:** not reached in this lane. It is the implementer's call on the evidence
  above.
