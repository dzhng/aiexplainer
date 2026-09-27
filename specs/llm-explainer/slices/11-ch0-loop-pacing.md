# 11 — Chapter 0 loop pacing and final copy

**Milestone:** M1 · **Depends on:** 10 · **Visual variable:** loop pacing

## Contract

Chapter 0's arrival loop lands its point within 10 s and runs 20–30 s (D24).
Interaction follows D32. The chapter's copy is final under the copy rules. This
slice sets the pacing pattern every later chapter copies.

## Seam

- **Chapter 0 loop** (`data/autocomplete.ts`), beats:
  1. The word "once" lands on the rail.
  2. The count bars rise to the real successor counts.
  3. The tallest bar flashes.
  4. "upon" is chosen and slides onto the rail.
  5. The bars rise again.
  6. Then show chapter 0's visible failure (the why-line for chapter 1): feed an unseen or misspelt word and **no bars appear**. That word never showed up in the counts.
- **Copy:** final storyteller captions, the Precisely line, labels in both readings, and stats with scales.
  - Example stats: "words counted (TinyStories)", "distinct words (this tiny model)", "most likely next word".
- **D32 wiring:** any control input pauses, ▶ resumes, and `goto` restarts the loop. The Follow target switches the caption to `byFollow`.

## Playable

`/#0`, which loops continuously.

## Verify

- **Filmstrip:** one frame per second across the whole loop, with the caption beats burned in underneath (`verify.ts --strip 0:<dur>:1`).
  - **Variable:** pacing. The point lands by 10 s, the failure beat is legible, and the loop seam is invisible.
  - **Out of scope:** framing and look, which are frozen from slice 10.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) on the strip as the last check.
- **Reducer and timeline tests** cover D32.
- **Validation:** `validateChapter` passes, and the caption word counts are within budget.
- **Human checkpoint (non-blocking):** play `/#0` and read the copy, the first read of the voice. Use preview-shots on the strip, wait about 5 minutes, then decide and record the call here.

## Delegated

Beat timings within the budget, and the exact example words, which must come from the `counts` probe (O2).

## Stays green

01–10.

## Feedback that would change this slice

Voice or tone notes. These propagate to the copy rules in the README.

## Record (2026-09-27)

- **Loop:** 20 s. The rule plays twice before the failure: "once" → bars → the tallest,
  "upon", lights and stays lit while "upon" takes the card (by 7 s) → bars for "upon" → "a"
  lights and takes the card (by 11 s) → the spread for "a" → the misspelt "onse" lands, no
  bars rise, and "never seen “onse”: no counts" appears → the card leaves and the rail is
  empty at the seam. A `barsWord` channel lets the bars lag the card so the pick stays lit
  while its word moves. Every example word is the model's own (a test checks each input is
  the previous one's top successor and that "onse" is not in the vocabulary).
- **Filmstrip:** `throwaway/shots/11/loop-strip.png` (frames `loop-t0.png` … `loop-t19.png`),
  shot with `verify.ts --strip 0:19:1`. Two rounds of unprimed critique drove the retiming:
  the first hand-off happened off-camera, the failure hold was 6 s of identical frames, and
  the seam showed the card bouncing back with a new spelling; a third pass moved the failure
  note to the moment "onse" lands and made labels keep clear of the HUD panels too.
- **Copy read (human checkpoint; implementer's call): accepted.** Captions are within the
  budget; `p` is described as a share of the kept counts everywhere ("each bar is one word's
  share of those kept counts"); shares never round to a false 0 % or 100 % (`<1%`, `>99%`).
