# 01 — Story in data

**Visual variable:** none (copy review page)

## Contract

The whole story lives in chapter data and is validated: acts and the side room, each machine's question as its title, briefs framed "So far / Still missing / This lesson", a "But" hand-off per chapter, the myth lines, and the intro's copy. **Every caption, label, stat label and help line is re-voiced for a curious adult with no tech background (H14)**; technical names move to the Technical toggle. It can be read end to end on one page.

## Seam

- `apps/explainer/src/chapters/acts.ts`: `ACTS: readonly { id: "intro" | "I" | "II" | "III" | "behind"; name: string; blurb: string; optional: boolean; slugs: readonly ChapterSlug[] }[]`, `actOf(slug)`. One owner of act and side-room membership; `LADDER` stays the owner of order, and a test checks `ACTS.flatMap(a => a.slugs)` equals `LADDER`.
- `ChapterDef.title` becomes the machine's question ("How does it read?"); the old technical name moves to `ChapterDef.term` (shown in the Technical line and as the breadcrumb tooltip).
- `ChapterDef.brief` becomes `{ soFar: string; missing: string; lesson: string }` (the intro uses `soFar` for "What it is" and has no `missing`). `ChapterDef.myth?: string` where story.md answers one. `ChapterDef.handoff: string`, one sentence starting "But" (the last main-path machine's is the closing line; side-room machines have none). Delete `ChapterDef.why` (it duplicates "Still missing").
- The copy rules here replace the archived "software engineer" register: plain words first, no jargon in titles, captions, analogy labels or stat labels; technical terms only in Technical lines.
- `validateChapter` checks: every sentence ≤ 25 words, the handoff starts "But" where required, each slug is in exactly one act, and no jargon word appears where the copy rules forbid it.
- Copy comes from [story.md](../story.md), unchanged unless a claim doesn't match the scene (then fix the copy to the scene and note it).
- `/lab/story`: renders the acts and, in ladder order, each chapter's brief rows, caption and handoff.

## Playable

`/lab/story` — the human reads the whole story in one scroll.

## Verify

- bun tests: the validator rules; every main-path chapter after the intro has `missing`; acts cover the ladder exactly once; a jargon list ("token", "embedding", "attention", "logit", "transformer", "tensor", "vector", "softmax", "MLP", "residual", "KV", "quantiz") never appears in titles, captions, analogy labels or stat labels.
- `bun run verify` green; harness PASS on `/lab/story` and all `/#N`.
- The HUD still reads (the why-line is gone; the brief rows replace it in slice 03 — until then show `brief.missing` where the why-line was).
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

The page layout of `/lab/story`, and any copy edit that keeps the meaning and the rules.

## Feedback that would change this slice

The human's read of the story. Wording changes land here, never later in scene code.
