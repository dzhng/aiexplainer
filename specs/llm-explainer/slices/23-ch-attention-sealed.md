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

## Record (2026-09-27)

- **The later words** are this tiny model's own greedy continuation after "but": " she was very
  happy" for the Mia prompt (`FUTURE_WORDS` = 4; typed text gets the same).
  - The run traces the whole text from the focus position. Every weight after the focus is
    exactly 0 (the causal mask), and the weights up to the focus equal the prompt-only run
    bit for bit.
  - They stand dim on the same line as the focus word and never wrap onto a line of their own.
- **SealedCap (`kit/sealed.ts`):** a short stub of pipe, the same glowing pipe material,
  rising straight up from the middle of the block's top and shut by a wider grey cap.
  - It rides its block as it rises, and opens (`widthScale` 0 → 1) only once the block is up.
  - An earlier draft leaned the stubs toward the mix and used grey metal throughout. The
    unprimed critique read that as periscopes or bolts attached to the row behind.
- **Beat:** at 10.4 s the later words rise with their caps, and the note "you can't read
  tomorrow's newspaper" appears on the riser under them. The label "Later words: sealed" pins
  to the last one. The loop is now 24 s.
- **Other changes:**
  - Earlier words now rise line by line, and the mix block is hidden until they do.
  - The follow target "The words" gave way to "Sealed".
- **Test:** the later words are the model's greedy picks; their trace weights are exactly 0; caps
  open only on positions after the focus, and no pipe runs from them.
