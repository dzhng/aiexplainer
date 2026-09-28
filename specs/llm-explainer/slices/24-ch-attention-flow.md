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

## Record (2026-09-27)

- **FlowPulses (`kit/flows.ts`)** is a sleeve over each pipe path, 1.12× the pipe's radius.
  - It uses a material with `pulses` (translucent, and it only adds light).
  - The shader lights dashes along the tube's arc length. `Vertex.along` fills the last float
    of the 48-byte record.
  - Dashes are `look.flow.spacing` apart (0.3 m) and `duty` long (0.4). They move at
    `look.flow.cyclesPerSec` (1.4/s) through each slot's `flowPhase`.
  - Each dash swells toward its leading end and fades at both ends.
  - `?layers=flows` shows only that layer (`runtime/debug-layers.ts`).
- **Pulses** ride every pipe at its width (`widthScale`) and come on once the widths settle.
- **Needle (beat 2)**, "the focus word's arrow shifts toward the referent":
  - A rod on the mix tilts toward "Mia" by the real change in angle between "but"'s vector
    and Mia's embedding: 90.1° before attention, 74.2° after.
  - Its tag reads "16° closer to “Mia”". The run records `turn` from the full trace.
- **Failure beat (D35)** uses the attn model's measured order pair: "The dog chased the cat.
  Then the" / "The cat chased the dog. Then the".
  - Only "dog" and "cat" hop to each other's places, and the pipes regrow at the new
    positions.
  - The guess "“cat”, 35% sure" stays up through the swap. The note reads "same mix, same
    guess: the order is lost".
  - Test: the two orders' last-position logits are bit-identical. The guesses and turns in the
    run are equal, and each word keeps its weight wherever it stands.
- **Loop:** 30 s. The point lands by 7 s.
- **Critique fixes:**
  - The first pulses read as solid beads, so they are now softer and dimmer.
  - The guess used to vanish during the swap.
  - The share text overflowed its blocks, so there is more room for it.
  - The stand now rises with the words, so the seam and the change of story start flat.
