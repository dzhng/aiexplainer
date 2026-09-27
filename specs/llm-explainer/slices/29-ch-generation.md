# 29 — Chapter 9 · `generation` — the loop

**Milestone:** M4 · **Depends on:** 28 · **Visual variable:** cycle rhythm. The "write one word, reread everything" cycle is legible, and the work counter visibly grows.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 9 · `generation` is playable at `/#9`, backed by its real model and passing the template's checks.

## Model

`full`, with `generate()` added to `packages/llm/src/generate.ts` (a seeded, cancellable async iterator in the worker).

## New kit primitive

none new

## Loop beats (20–30 s)

1. The output word flies back to the end of the input.
2. The whole machine lights up again from the first word.
3. The work counter (tokens processed, this tiny model) climbs quadratically.
4. **Failure beat:** the machine recomputes everything for every word.

## Notes and scope

The prompt box lets the user generate. Browser timing is never shown as speed (D27). The counter counts operations, not milliseconds.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that generation is deterministic with a seed, that EOS and the context limit stop it, and that the work counter equals Σ(prefix lengths).

## Delegated

Generation length within the loop.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
