# 33 — Chapter 13 · `speculative` — the junior drafts, the senior checks

**Milestone:** M4 · **Depends on:** 17, 18, 32 · **Visual variable:** acceptance grouping read. Accepted, rejected and bonus tokens are distinguishable at a glance.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 13 · `speculative` is playable at `/#13`, backed by its real model and passing the template's checks.

## Model

`drafter` + `full`, with `speculativeStep` added to `packages/llm/src/speculative.ts` (the Leviathan/Chen acceptance rule, residual resampling, the bonus token, KV rollback).

## New kit primitive

DraftStrip (the draft tokens with accept, reject and bonus states)

## Loop beats (20–30 s)

1. The junior (small machine) races ahead k=4 words.
2. The senior checks all 4 in one pass (one bus trip).
3. Accepted words turn gold, and at the first reject the senior's own word replaces it.
4. The measured α and tokens-per-trip chips are shown (this tiny model), next to `specExpectedTokens` (arith).
5. **Failure beat:** a bigger senior is still slower per word (a teaser for chapter 14).

## Notes and scope

**Finalises O3:** re-measure α for the provisional drafter on held-out prompts. If the alternative candidate wins, switch the drafter and record why.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- **Distribution test:** a χ² test over 10k seeded samples on a fixture vocabulary. The speculative output distribution equals the target distribution.
- Forced-branch tests cover all-accept, first-reject and bonus.
- KV rollback is correct.

## Delegated

k (default 4).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Results (2026-09-27)

- **O3 is final: `drafter-64`.** The drafter probe now re-measures α on 40 held-out stories that the 20 selection windows never touched (`held_out_windows` in `training/probes/common.py`), and records it as `draft-acceptance-heldout` / `draft-speedup-heldout`:

  | drafter    | α (chosen on) | α (held out) | speedup k=4 (held out) |
  | ---------- | ------------- | ------------ | ---------------------- |
  | drafter-64 | 0.595         | **0.601**    | **1.24**               |
  | drafter-96 | 0.638         | 0.643        | 1.03                   |

  drafter-96 keeps more guesses, but costs 0.353 of the target per guess against 0.215, so drafter-64 stays the faster pair. The original evidence re-measured bit for bit.

- **`speculativeStep`** (`packages/llm/src/speculative.ts`) runs one round on a `SpeculativeState` (the committed tokens and both KV caches, rolled back to the committed prefix after each round); `speculate` loops it. The acceptance rule itself is the pure `verifyDrafts(p, q, drafted, rng)` (min(1, p/q), the residual max(0, p − q) at the first rejection, the bonus row after k). Tests: χ² over 10k seeded samples on a 5-token fixture vocabulary (first token and the two-token joint both match p; q fails by 10× the critical value), forced all-accept + bonus / first-reject / mid-reject branches, and KV rollback checked against a fresh forward pass.
- **k is the slider** (delegated, default 4): the run holds the seeded rounds for every k from 1 to 8, so the tiles, the story and the "words per senior check" chip (`specExpectedTokens` fed α from the probe through an `ArithArg` binding) all follow it.
- **The seed (11) was picked**, from seeds 1–12 on the drafter's scenario prompt, as one whose first three k=4 rounds show all kept + a bonus ("girl named Lucy." + " She"), a mid-draft correction ("had a rich [boy]" → " toy") and an early rejection ("car" + " that"). The chips are the held-out averages, not this run.
- **DraftStrip** (`packages/renderer/src/kit/draft-strip.ts`): a face per tile and one shell per verdict (`draftAccepted` gold, `draftRejected` dark, `draftAdded` blue); `setDraftTile` shows exactly one, allocation-free. Rejected tiles also drop, so the grouping reads by height as well as colour.
- **The session gained `speculate`** (worker, `createInference`, `localSession`), naming both models.
- **Shots** (`throwaway/shots/33/`): `strip-turn-t{0,1,3}`, `app-t4`, `app-t10`, `app-t21`, `loop-strip`, `sweep-sheet`, `exploded`.
