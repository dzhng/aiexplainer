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
