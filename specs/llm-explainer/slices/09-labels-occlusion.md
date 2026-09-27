# 09 — Pinned labels and occlusion

**Milestone:** M1 · **Depends on:** 08 · **Visual variable:** label pin accuracy and legibility

## Contract

Labels pinned to 3D parts are HTML overlays placed with the same camera function
the GPU uses. They hide when the part is behind solid geometry or off-screen.
Label text never reaches the renderer.

## Seam

- **`packages/renderer/src/labels.ts`**, CPU only and bun-testable:
  - `sceneOccluders(scene, view): Occluder[]` builds boxes from mesh and block bounds, and capsules from tubes, after `partWorld`.
  - `placeLabels(matrices, viewport, anchors, occluders, out): LabelPlacement[]`, where `LabelPlacement` is `{ id, x, y, visible, hiddenBy?: 'occluded' | 'offscreen' | 'behind' }`. It raycasts with `math/shapes` `raycast3` from the eye to each anchor.
  - `SceneDesc.anchors` carries only `{ id, part, local, priority }`.
- **`apps/explainer/src/hud/Labels.tsx`:** renders the text from `ChapterDef.labels` in the analogy or precise reading (D16). It positions labels through refs every frame, with no React re-render per frame. The label layer sits above the canvas and below the HUD panels.
- **Label style:** a dot on the part, a short leader line, and a pill, as in the reference.
- **Overlap resolution:** lower priority hides first.
- **Probe:** `labels()` returns the placements. `crops()` gains `label:<id>`.

## Playable

`/lab/renderer?fixture=occluded-labels`, and `/lab/renderer?fixture=board-room` with fixture labels.

## Verify

- **bun tests:**
  - An anchor behind a box is `occluded`.
  - An anchor in front is visible.
  - An anchor behind the camera is `behind`.
  - A capsule occluder hides an anchor behind a tube.
  - Overlapping labels resolve by priority.
- **Pixel check:** the label dot lies within 2 px of the projected anchor, on a marker-sphere fixture.
- **Shot:** an orbit sweep of 12 azimuths as a contact sheet cropped to the union of `label:*`.
  - **Variable:** pin accuracy and legibility. No label sits over solid geometry it should be hidden by, none overlap, and all are readable at 1280×720.
  - **Out of scope:** the label wording.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.

## Delegated

Pill styling within the tokens, the leader-line geometry, and the overlap heuristic.

## Stays green

01–08.

## Feedback that would change this slice

A preference for labels that fade instead of snapping. That is a CSS transition only.
