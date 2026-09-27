# 10 — Chapter 0 composed: framing

**Milestone:** M1 · **Depends on:** 04, 09 · **Visual variable:** camera framing

## Contract

The real app at `/#0` puts the HUD (slice 04) over the renderer. `buildFrame`
turns chapter data plus the real `counts` model output into a `FrameInput`.
The hero shot frames the subject clear of the HUD.

## Seam

- **`apps/explainer/src/scene/build-frame.ts`:** `buildFrame(def, timelineState, ui, run, out): FrameInput`. It is pure and has no DOM or GPU access. It dispatches on `def.scene` to a builder.
- **`apps/explainer/src/scene/builders/autocomplete.ts`:**
  - The counter-board prop.
  - The count bars (instanced `block`s) whose heights are the real `nextWords` probabilities for the current word.
  - A word card on the rail.
  - Follow targets: "Counts", "Next word", "Your text".
- **`apps/explainer/src/runtime/app.tsx`:** owns the clock, the renderer and the frame loop:
  - `clock.now()` → `evalTimeline` → `buildFrame` → `renderer.frame`.
  - Then `placeLabels`, then the label refs.
- **Chapter 0 prompt box:** the user types a word and the bars update from `nextWords`. Inference is synchronous here; the Web Worker arrives in slice 15.
- **`/lab/scene/<slug>`:** a chapter's scene only, with no HUD. It is driven by a committed fixture run (`src/lab/fixtures/runs/<slug>.json`) at a held time, so no inference runs. Every later chapter slice reviews its scene here.
- **`shots.json`** gains `bench-close`, the chapter-0 hero shot.
- **Probe:** `goto(slug)` and `setUi(partial)`. `crops()` gains `safe`, the canvas minus the HUD panel rects.

## Playable

`/#0` in dev and in the Vite preview: the full chapter 0, with the loop still in draft.

## Verify

- **bun test:** a snapshot of `buildFrame` for a fixed word and time. Parts, slots and bar heights must equal the `counts` golden probabilities.
- **Shot:** the full canvas at the hero time, with the `safe` rect overlaid.
  - **Variable:** framing. The subject sits inside `safe`, nothing important is under a panel, and the composition is balanced.
  - **Out of scope:** pacing, copy.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against `assets/reference/airsup-whole.jpg` (subject-to-frame ratio and HUD clearance).
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Integration:** the whole frame with everything on, compared with compare-screenshots against the accepted crops from slices 04–09. Check that nothing regressed when they were composed.
- **Human checkpoint (non-blocking):** the first full look of the product. Use preview-shots, wait about 5 minutes, then decide and record the call here.

## Delegated

Bar layout on the board, the hero pose values, and the prompt-box placement (inside the top-left panel or the bottom-left).

## Stays green

01–09.

## Feedback that would change this slice

Framing preferences, which change `shots.json` only. A rethink of the chapter-0 metaphor goes back to the map ladder.

## Record (2026-09-27)

- **First full look (human checkpoint; implementer's call): accepted.** Shots:
  `throwaway/shots/10/hero-safe.png` (the hero frame at t = 5.4 s with `safe` outlined),
  `hero.png`, `typed.png` (the reader typed "the"), `lab-scene.png` (`/lab/scene/autocomplete`),
  `vs-airsup.png` (the reference beside ours). The board sits wholly inside `safe`; nothing
  important is under a panel. Next to the reference ours is a smaller, framed object rather
  than a full-bleed one: the spec puts the subject inside `safe`, and the title panel here is
  much taller than the reference's.
- **Integration:** the four HUD panels compose unchanged against slice 04's accepted crops
  (the prompt box is new); the scene matches the accepted slice 07–09 look.
- **Inference runs in the Web Worker already** (`runtime/session.ts`, slice 15), so the
  synchronous `nextWords` seam planned for this slice never existed.
- An unprimed critique found the first framing loose (bars a thin band, the value tags
  clipping bar tops, labels over tags); the shot was tightened on the bar field, tags lifted,
  and labels now choose a side that avoids scene text.
