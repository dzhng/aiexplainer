# 13 — Vocabulary lock: kit, tokens, views

**Milestone:** M2 · **Depends on:** 12 · **Visual variable:** the house style, as a token and kit page (reviewed once for the whole app)

## Contract

From here on, chapters compose from a frozen vocabulary: colour tokens, emissive
levels, flow rhythm, type, camera shot presets, and the kit primitives with
their meaning under Cutaway and Exploded. A chapter can't invent a colour, a
shot or a primitive. Adding one requires a kit sub-step inside the chapter slice
that introduces it, and that sub-step gets its own shot (see slices 19–34).

## Seam

- **`packages/renderer/src/kit/`:** one module per primitive.
  - Each exports `build(params) → { parts: Part[]; bounds: Box3; anchors: SceneAnchor[]; explode: Vec3 }` from a single source, so meshes, occluders, labels and views all agree.
  - The kit starts with the existing `block`, `tube`, `mesh` and `bars`. Chapter slices add their own primitives through this interface.
- **Views, defined once:**
  - **Cutaway** clips every part tagged `cutaway: 'clip'` (housings) against the plane in `look.json`. The clip is done in the fragment stage, and the cut faces get a solid cap colour.
  - **Exploded** applies each part's `explode` vector scaled by `view.t` (animated 0 → 1 over 0.6 s).
  - `partWorld` (slice 05) is the only place either is applied.
- **`/lab/tokens`**, completed: palette swatches through the real bloom, emissive levels, type-scale specimens, HUD panel specimens, label specimens in both readings, flow-rhythm swatches, and the Cutaway and Exploded demo on the chapter-0 board.
- **`/lab/kit/<primitive>`:** a turntable for any kit primitive.
- **`apps/explainer/scripts/sheet.ts`:** `bun run sheet --variable <crop> --chapters all` makes a contact sheet of one crop across every finished chapter. This is the consistency check that later slices use.
- **`validateChapter`** now also rejects unknown kit primitives, shot ids and colour tokens (this extends slice 03).

## Playable

`/lab/tokens` and `/lab/kit/board`. Chapter 0's Whole, Cutaway and Exploded views now work at `/#0`.

## Verify

- **bun tests:**
  - `partWorld` for the explode and cutaway views.
  - Every kit primitive's anchors lie inside its bounds.
  - The validator rejects an unknown primitive, shot and token.
- **Shots:** `/lab/tokens` full page, and `/#0` in each of the 3 views.
  - **Variable:** the house style as a whole (this is the one deliberate exception to one-variable-per-shot, because it is the reference sheet everything else is judged against).
  - Also check view legibility: the cut faces read as cut, and exploded parts don't collide.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md): the views against `assets/reference/airsup-cutaway-follow.jpg` and `airsup-exploded.jpg`.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Human checkpoint (non-blocking):** the token page is the style guide. Use preview-shots, wait about 5 minutes, then decide and record the call here.

## Delegated

The cut-plane direction per chapter (within `look.json`), the explode animation curve, and the token page layout.

## Stays green

01–12.

## Feedback that would change this slice

Any token change. After this slice it propagates to every chapter automatically, which is the point of locking the vocabulary.
