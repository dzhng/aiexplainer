# 30 — Chapter 10 · `kv-cache` — sticky notes, shared notes, keep only the last N

**Milestone:** M4 · **Depends on:** 18, 29 · **Visual variable:** note occupancy read. Notes are visibly written once and reused, the rack grows, sharing (GQA) halves it, and the window evicts.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 10 · `kv-cache` is playable at `/#10`, backed by its real model and passing the template's checks.

## Model

`full` (GQA, D36), with `KvCache` added to `packages/llm/src/kvcache.ts` (append, read, evict, reset, byte accounting).

## New kit primitive

NoteRack (a rack of sticky-note slots per layer, with fill and eviction)

## Loop beats (20–30 s)

1. Each word writes its notes once.
2. The next word reads the notes instead of recomputing.
3. The memory chip grows (this tiny model), next to the Llama-3-8B chip (128 KiB per token, via arith).
4. The "readers share notes" scenario shows GQA.
5. The "keep last N" scenario shows the sliding window, with the caption saying it changes outputs and is not how Llama-3-8B runs.
6. **Failure beat:** even with notes, each new word waits on a slow trip.

## Notes and scope

Scenarios: full cache, shared notes, window.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- Cached and uncached logits are equal for the same semantics.
- Windowed output is compared with a windowed reference, not with full context.
- The byte chip equals `kvBytesPerToken`.

## Delegated

The window size shown (≤ 64).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
