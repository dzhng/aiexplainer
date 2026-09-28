# 01 — Story in data

**Visual variable:** none (copy review page)

## Contract

The whole story lives in chapter data and is validated: acts, briefs framed "So far / Still broken / This lesson", a "But" hand-off per chapter, and the intro's copy. It can be read end to end on one page.

## Seam

- `apps/explainer/src/chapters/acts.ts`: `ACTS: readonly { id: "intro" | "I" | "II" | "III"; name: string; blurb: string; slugs: readonly ChapterSlug[] }[]`, `actOf(slug)`. One owner of act membership; `LADDER` stays the owner of order, and a test checks `ACTS.flatMap(a => a.slugs)` equals `LADDER`.
- `ChapterDef.brief` becomes `{ soFar: string; broken: string; lesson: string }` (the intro uses `soFar` for "What it is" and has no `broken`). `ChapterDef.handoff: string`, one sentence starting "But" (chapter 14's is the closing line, exempt). Delete `ChapterDef.why` (it duplicates "Still broken").
- `validateChapter` checks: every sentence ≤ 25 words, the handoff starts "But" (except 14), each slug is in exactly one act.
- Copy comes from [story.md](../story.md), unchanged unless a claim doesn't match the scene (then fix the copy to the scene and note it).
- `/lab/story`: renders the acts and, in ladder order, each chapter's brief rows, caption and handoff.

## Playable

`/lab/story` — the human reads the whole story in one scroll.

## Verify

- bun tests: the validator rules; every chapter in Acts II–III has `broken`; acts cover the ladder exactly once.
- `bun run verify` green; harness PASS on `/lab/story` and all `/#N`.
- The HUD still reads (the why-line is gone; the brief rows replace it in slice 03 — until then show `brief.broken` where the why-line was).
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

The page layout of `/lab/story`, and any copy edit that keeps the meaning and the rules.

## Feedback that would change this slice

The human's read of the story. Wording changes land here, never later in scene code.
