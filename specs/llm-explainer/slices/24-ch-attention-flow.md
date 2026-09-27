# 24 — Chapter 4 · `attention` (c) — flow rhythm and the chapter-4 failure

**Milestone:** M4 · **Depends on:** 23 · **Visual variable:** flow rhythm. It reads as travel, not flicker, spacing is even, and the rhythm matches the look token.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 4 · `attention` (c) is playable at `/#4`, backed by its real model and passing the template's checks.

## Model

`attn`.

## New kit primitive

FlowPulses (dash pulses along tubes, phase from `flowPhase`; speed and spacing from the look tokens)

## Loop beats (20–30 s)

Completes the chapter 4 loop:

1. Pulses carry colour from wide pipes into the focus word.
2. The focus word's arrow shifts toward the referent.
3. **Failure beat:** shuffle the earlier words, keeping the last one fixed. The pipes rearrange, but the mix into the focus word is **identical** (D35). Order is lost.

## Notes and scope

An 8-frame filmstrip over one pulse period, cropped to `part:pipes` with `?layers=flows`, is the shot for this variable.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the shuffled and unshuffled last-position logits are bit-identical for the `attn` model (D35), and that the on-screen claim is derived from this test's fixture.

## Delegated

Pulse shape.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
