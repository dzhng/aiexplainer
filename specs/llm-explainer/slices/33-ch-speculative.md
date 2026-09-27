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
