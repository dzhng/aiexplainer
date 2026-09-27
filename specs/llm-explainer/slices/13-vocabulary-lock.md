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

## Record (2026-09-27)

- **Kit:** `packages/renderer/src/kit/` holds `block`, `tube`, `mesh` and `bars`.
  - Each primitive's `build(params)` returns `{ parts, bounds, anchors, explode }`, plus an
    `example` build. The contract lives in `primitive.ts` and the catalogue in `catalog.ts`.
  - Parts carry `primitive`, and every part now has optional `explode` and `cutaway`.
  - `mesh` can split a prop into one part per node, with per-node explode vectors and
    clipping by name prefix.
  - Chapter 0's builder is rebuilt from the kit: the board is split into its nodes, and
    `bars` and `block` are used for the bars and card.
- **Views:**
  - `partWorld` applies Exploded (`explode × t`); `partCut` decides Cutaway. They are the only
    places either is applied.
  - The cut is a fragment-stage discard against `FrameView.cut`, which defaults to
    `look.views.cutaway.planes`. The cut plane sweeps in by `t`.
  - While cutting, the frame swaps to a discard prepass and no-cull pipelines. Back faces
    seen through the cut are shaded flat in the cap colour (`views.cutaway.cap` × gain).
  - Cut parts stop occluding labels.
  - `scene/views.ts` eases a view in over `views.durationSec` (0.6 s, smoothstep), and eases
    the old view out first. It runs on a real-time `motionClock`, so held-clock lab pages
    still settle.
  - `/lab/scene/<slug>?view=` opens a scene settled in a view.
  - Chapter 0's cut is a front section (plane z = 0.08) through the housing, slot channels
    and rail. Exploded pulls the housing back, the slots and bars forward together, and the
    rail and card forward and down.
  - The board's bezel, header and ticks now stand 2 mm proud of the panel face, so no back
    face is coplanar with it. The coplanar faces z-fought in the cap.
- **Validator:** `validateChapter` rejects an unknown shot, colour token, scene or kit
  primitive. `SCENE_KIT` names each scene's primitives, and a test holds the builder to it.
- **`/lab/tokens`:** one page with these sections:
  - palette: DOM swatches, plus the emissive × bloom frame;
  - type scale;
  - HUD panels, using the live classes;
  - stat chips;
  - labels in both readings, using the real label layer;
  - flow rhythm;
  - the three views as scaled full-size frames.

  `/lab/kit/<primitive>` turntables each primitive's example. `bun run sheet --variable
<crop> --chapters all` joins one crop across the written chapters. `verify.ts` gains
  `--full`.

- **Shots:** all in `throwaway/shots/13/`.
  - The app in each view: `app-whole.png`, `app-cutaway.png`, `app-exploded.png`.
  - The token page: `tokens.png`, with `crop-tokens-views.png` for its Views section.
  - The kit: `kit-sheet.png`.
  - Against the references: `vs-cutaway.png` and `vs-exploded.png`.
  - The sheet is at `throwaway/shots/sheet/part-board.png`.
- **compare-screenshots:** against airsup's cutaway, ours reads as a section (cap-coloured
  faces on every cut wall), but a thin board has little interior to reveal. Against airsup's
  exploded view, ours separates in depth only, so from the hero angle it reads mostly as
  parallax. Page metrics show the token page as dark and sparse (dominant colour share 0.66),
  which is expected for a style sheet on bgDeep.
- **screenshot-critique, round 1:** the vertical cut left bars floating and the cap as a
  hairline; slots and bars exploded out of register; the view thumbnails clipped their text.
  All three were fixed: a front section, bars moving with their slots, and frames scaled from
  1440×900.
- **screenshot-critique, round 2:**
  - Confirmed fixed: the cut reads as a section, and the bars and slots line up.
  - Still open:
    - the flat, bright cap reads a little like a painted frame, with hairline cap specks at
      the slot edges (the next step is a shaded cap with a subtle hatch);
    - from the hero angle the Exploded view reads mostly as a depth shift, and the right slot
      column crosses the right post (an angled exploded shot, or a sideways spread, would fix
      it);
    - the scaled view thumbnails on the token page have unreadable 5 px scene text (by
      design, since they are scaled frames);
    - the 16× swatches blow out to white;
    - section widths on the token page are uneven.
- **Performance** (board-room, 1440×900): 1.6–2.2 ms with bloom (≤ 8 ms).
- **Registry:** the baseline holds.
- **Human checkpoint (implementer's call): token page accepted as the style guide.**
