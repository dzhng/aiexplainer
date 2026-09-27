# 19 — Chapter 1 · `tokenizer` — Lego bricks

**Milestone:** M4 · **Depends on:** 13, 14 · **Visual variable:** brick segmentation read. A typed sentence visibly snaps into bricks, and common words are one brick while a rare word takes several.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 1 · `tokenizer` is playable at `/#1`, backed by its real model and passing the template's checks.

## Model

the shared tokenizer (slice 14). No neural model.

## New kit primitive

TokenBrick (a Lego-like brick with its text on the face)

## Loop beats (20–30 s)

1. The chapter-0 failure word (unseen or misspelt) reappears.
2. It snaps into several known bricks.
3. The whole sentence becomes a row of bricks, each with its id stamped on it.
4. The "box of shapes" (the vocab count chip) is shown.
5. **Failure beat:** "cat" and "kitten" are just two unrelated ids. Nothing says they're alike.

## Notes and scope

Stats: vocab size (this tiny model), average characters per brick (TinyStories), Llama-3-8B vocab 128,256. Follow targets: Bricks, Ids, Your text. Slider: none meaningful, so use a text-length scrubber. Scenarios come from the tokenizer probe.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the brick pieces equal `tokenizer.pieces()` for the scenario prompts.

## Delegated

The mapping of brick colour to piece frequency.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
