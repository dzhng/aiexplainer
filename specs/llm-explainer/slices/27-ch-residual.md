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

## Record (2026-09-27, lane C)

- **Scene.** There are four stations on posts.
  - **First half (no river, `noresidual`):** the word's signal travels station to station
    through pipes whose radius is the traced stream RMS. The signal is gone after the first
    station: 0.0089 → 0.0 in the trace. The readout says "no idea: 1 in 4,096 each"
    (p = 1/V).
  - **Second half (`residual`):** a translucent river runs under the stations. This is the
    new kit primitive `river`: stretches plus pour chutes. Stretch height is the stream RMS
    as a share of the embedding's, √-scaled: 0.082 → 0.59 → 0.97 → 1.38 → 2.73, so the river
    ends 33× its start on this text. Chute width is what each station adds. Each station has
    a `volumeKnob` (new kit primitive) whose angle is the log of the stream size its RMSNorm
    divides by. The readout shows "girl" at 35%.
  - **Failure beat:** "still a shaky guess".
- **Slider.** "Station to read" (1–4) writes that station's incoming river size and "knob sets
  it to 1×" beside it. The slice named no slider.
- **Chips.**
  - `val-loss-noresidual` 8.32 nats and `val-loss-residual` 1.90 nats. These are new
    evidence entries written by `training/probes/residual.py`, rerun with `--probe-only` on
    both models. The chapter's model is `residual`, so noresidual's loss has to travel in
    shared evidence.
  - `signal-preserved-residual` 21.5×.
  - New stat format `nats`.
- **Tests** (`test/ch-residual.test.ts`):
  - The stream sizes equal each model's traced residual RMS.
  - River heights equal `riverHeight(ratio)` of the traced sizes.
  - The knobs turn monotonically.
  - The chips equal both manifests' `training.valLoss` and the probe.
  - The seam matches, and the point lands by 10 s.
- **Loop.** 20 s: no-river 0.3–2.8 s, river 4.4 s, pours and knobs 5.2–8.6 s, guess 8.6 s,
  failure 12.4 s. The readout says "reading…" until the signal has passed every station.
- **Critique (unprimed, one round):**
  - Fixed: the pacing lagged its captions, and the guess appeared before the mechanism; the
    card text overflowed; the station tag covered its knob; the knob label pointed at the
    station's edge; the knob turn was too small to read. The two numbers (21.5× average vs
    33× on this text) also looked contradictory, so the tag now says "this text".
  - Open, accepted:
    - The river reads more as a glass duct than as water; the chutes have no splash.
    - The knob and river labels still point at empty space during the no-river half, because
      labels are per chapter, not per beat.
    - The best-guess card is one-sided, so it is blank from behind.
    - The kit turntables are dark on navy.
    - Stations are plain boxes, so the finish is a step down from chapter 6.
