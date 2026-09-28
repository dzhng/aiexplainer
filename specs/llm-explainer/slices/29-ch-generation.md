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

## Record (2026-09-27, lane C)

- **Scene.** The text sits on a rail in front of the machine: `full`'s four layers drawn as
  four bands on one housing. Each step (3 s):
  - a light sweeps every word from the first, and each word's feed pipe lights as it is
    reread;
  - the bands run;
  - the new word appears above the machine and arcs to the end of the rail;
  - the work counter (a bar in a glass track) climbs by that step's `fed`.

  Six words, 10 + 11 + … + 15 = 75 tokens read. The failure beat spells out that sum.

- **Model.** `generate()` (slice 28) with `cache: false`, seed 3 and temperature 0.8, run in the
  worker through `Session.generate`. Generation is cancellable between tokens; a session test
  cancels a 200-token run part-way. The words are " boy named Tim. Tim had".
- **Chips.**
  - Context 256 (model metric `context`).
  - 32,896 tokens reread to write 256 (arith `rereadTokens`, 1 + … + n).
  - Llama-3-8B's 8,192 context (arith `maxContext`).
- **Slider.** "Words to write" (1–6) caps the steps. The slice left generation length within
  the loop to the implementer.
- **Tests.** `test/ch-generation.test.ts` checks:
  - the words equal a direct seeded `generate`, and the same seed reproduces them;
  - each step's `fed` is its prefix length, and the counter tag equals Σ(prefix lengths);
  - the chips and the seam.

  `packages/llm/test/generate.test.ts` covers determinism, cache vs no cache, greedy,
  `<eos>` and the context limit.

- **Shared layout.** `LINE`, `buildLine`, `placeFeed` and `placeTile` in `builders/generation.ts`
  are reused by chapter 10.
- **Critique (unprimed, one round):**
  - Fixed:
    - The idle bands and the counter were flat. They now have a low glow.
    - The counter now shows each step's own cost ("+13 for this word"), so the growth by one
      more token per word lands before 10 s.
    - `<bos>` is labelled "start".
    - The reset contradicted its caption; the equation now clears before the words fade.
    - The loop went from 26 s to 24 s.
    - Two chips shared the label "longest text it can read"; the Llama-3-8B one is renamed.
  - Open:
    - "tokens read" is scene text, so it has no leader line and shows through the machine at
      side azimuths.
    - The machine is a plain box with four bands.
    - Long words ("named") overhang their tile.
