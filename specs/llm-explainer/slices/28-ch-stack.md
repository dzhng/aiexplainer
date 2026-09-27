# 28 — Chapter 8 · `stack` — several readers, an assembly line, and the one zoom-out

**Milestone:** M4 · **Depends on:** 13, 17 · **Visual variable:** the zoom-out camera path. One brief pull-back reveals the repeated blocks, then it returns to one block.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 8 · `stack` is playable at `/#8`, backed by its real model and passing the template's checks.

## Model

`full`.

## New kit primitive

none new (it reuses the kit). This slice owns the D5 camera move.

## Loop beats (20–30 s)

1. Heads split into parallel pipe bundles in different colours (real per-head patterns).
2. **Zoom-out beat:** the camera pulls back to show 4 blocks ("Llama-3-8B has 32" chip), then returns.
3. A coherent continuation is written from `full`.
4. **Failure beat:** it only predicts one next word.

## Notes and scope

Heads: 4, with the real `nKvHeads: 2` visible as shared note colours (a setup for chapter 10). A filmstrip of the zoom-out is the shot for this variable.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the per-head weights shown equal the trace for each head, and that the continuation text equals the worker's seeded output.

## Delegated

The camera path within `shots.json` presets.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Record (2026-09-27, lane C)

- **Scene.** The `full` model is an assembly line of four blocks set on a diagonal, so the room
  fits them.
  - Each block has a word rail, four readers (heads) and a pipe from every word to every
    reader. The pipe radius is linear in that head's real attention weight from the last word,
    in that block's own layer.
  - Heads 1–2 and 3–4 share a colour (violet and blue). These are the real GQA key/value
    groups (`kvGroup` [0,0,1,1]), set up for chapter 10's shared notes.
  - A belt links the blocks.
- **Interim representation.** The head pipes are straight `tube` segments (`placeSegment`), not
  lane B's `pipes` (PipeNetwork) primitive, which is only on lane B's branch. Swap them once it
  lands in `llm-explainer`.
- **D5 zoom-out.** `ChapterDef.pullBack { shot, channel }` is validated (unknown shot or
  channel). `chapter-scene.ts` eases the drawn camera from the reader's pose toward
  `stack-wide` with the arrival move's `arrivalPose`, driven by the loop channel `zoom` (out
  6.2–7.8 s, hold to 9.2 s, back by 10.8 s). Orbit input is untouched: the blend is applied
  on top of the orbit pose each frame.
- **Prompt.** "One day, a little bird was looking for". Chosen after critique: on the first
  prompt ("Once upon a time…") three of layer 0's four heads peak on the same word. On this one
  the violet heads pull from "looking"/"was" and the blue ones from "for". Both prompts are
  scenarios citing `heads-differ`.
- **Continuation.** The worker's new `generate` (seed 3, temperature 0.8, 24 tokens) writes
  " a friend. The bird had a friend, a big, black cat…" onto a page on the floor.
- **Failure beat.** One pass lights the belts block by block, and its one word ("a") lands on
  the rail.
- **Seams added.**
  - `packages/llm/src/generate.ts`: a seeded generator that stops at `<eos>` and at the
    context limit, and reports `fed` per step.
  - `Session.generate`: the worker pauses between tokens, and `cancel()` stops it part-way.
  - Metrics `heads`, `kvHeads`, `context`.
  - Arith `layers`, `maxContext`, `rereadTokens`. The last two are used by slice 29; they are
    committed here because they share files with this slice.
  - Material `barAlt` (active glow).
  - The slider "Block to light up" dims the other blocks' pipes.
- **Critique (unprimed):**
  - Fixed: the heads looked alike (prompt change); "write" and "one word" had no 3D action
    (pass lights the belts, word lands); static holds (the loop went from 26 s to 23 s and
    the zoom hold from 2.2 s to 1.4 s); the empty page plate (now hidden until it has words);
    tag collisions (one page tag).
  - Open:
    - Violet and blue together make the frame hotter than earlier chapters.
    - Pipes of block 2 show through block 1.
    - Labels at back azimuths point at the backs of readers.
    - Word tags can crowd when the rail is seen end-on.
