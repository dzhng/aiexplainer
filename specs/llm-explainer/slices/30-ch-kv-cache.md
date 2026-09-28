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

## Record (2026-09-27, lane C)

- **`packages/llm/src/kvcache.ts`.** The cache moved out of `forward.ts` and is now the one
  owner of the KV cache:
  - `createKvCache(model, capacity)`, `resetKvCache`, `kvRow`, `kvHeld`, `cacheBytesPerToken`
    and `kvBytes`.
  - A cache smaller than the context is a ring: position p lives in row p % capacity, so a
    position is evicted once it falls out of every window.
  - `forward` feeds a call longer than the ring allows in pieces, and throws on a ring cache
    with no window.
  - `generate({ window })` gives the cache exactly the window's capacity.
  - `speculative.ts` imports the cache from the new module.
- **Tests** (`packages/llm/test/kvcache.test.ts`):
  - Cached and uncached logits are equal token by token (< 1e-4).
  - The ring cache equals a windowed no-cache reference, not the full context.
  - Windowed generation matches a windowed reread, and the window changes the words.
  - The byte count follows the arch.
- **Scene.** Chapter 9's line, reused (`buildLine`), with a `noteRack` above the machine. This
  is a new kit primitive: shelves per layer, a column per word, four slots per cell.
  - The first pass writes a column per prompt word. Each later step feeds one token (one feed
    pipe) while every written column glows as it is read.
  - The memory tag reads "notes: 13 words × 2.05 kB = 26.6 kB". It uses the new model metric
    `kvBytesPerToken` (f32).
  - GQA: the two unshared slots per cell appear small ("if each of the 4 readers kept its own")
    and drop away ("4 readers share 2 sets of notes: half the memory"). The model always keeps
    2 per cell (nKvHeads).
  - Window: only the last 4 columns stay. The note reads "keep only the last 4: it writes
    'girl named Lily.' instead of 'boy named Tim.' (not how Llama-3-8B runs)".
    - The window is 4, the implementer's call within ≤ 64. At 8, 6 and 5 this prompt's words
      don't change.
  - Failure beat: every new word still waits while Llama-3-8B reads all 16.1 GB of weights
    (arith `weightBytes`).
- **Chips.** 2.05 kB per word for this tiny model (`kvBytesPerToken` metric), 131 kB for
  Llama-3-8B (arith `kvBytesPerToken`, bf16), and 16.1 GB of weights read per word
  (arith `weightBytes`).
- **Tests** (`test/ch-kv-cache.test.ts`):
  - The cached words equal a reread's.
  - `fed` is [prompt, 1, 1, 1].
  - The windowed words equal a windowed reference's and differ from the full context's.
  - The chips equal `cacheBytesPerToken` and the arithmetic.
  - The copy carries the window qualifier.
- **Critique (unprimed, one round):**
  - Fixed:
    - Nothing showed the notes being read. A read line now runs from the rack into the
      machine and lights on each decode step, and only the word being fed keeps its feed
      pipe.
    - The rack floated. It now stands on metal posts and is raised clear of the new-word card.
    - The memory tag did not match the phase. During sharing it shows the unshared cost
      (heads ÷ kvHeads × 2.05 kB per word). During the window, evicted words drop out of the
      rail.
    - The unshared "ghost" notes were too small to read. They are drawn larger.
    - The phase note sits beside the rack.
    - The read beat was too long; sharing now starts at 11.2 s. The loop is 26 s.
  - Open:
    - The ledges overhang the rack's uprights slightly.
    - Long words ("named") overhang their tile (shared with chapter 9).
    - The rack reads a little like a vent when empty.
    - Labels at back azimuths point at hidden parts.
