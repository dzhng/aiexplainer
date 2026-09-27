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

## Record (2026-09-27)

- **Pixel check** (`--check label-dots` on `/lab/renderer?fixture=label-markers&bloom=0`):
  every dot and its placement lie within 0.71 px of its marker's rendered centroid at
  1280×720 (0.2 px at 1440×900); a shifted anchor fails at 10.6 px (negative control).
- **Sweeps:** `throwaway/shots/09/sweep-occluded-labels-t{0..11}.png`,
  `sweep-board-room-t{0..11}.png` (1280×720, cropped to `label:*`, whole frame when every
  label is hidden) and the sheets `sweep-occluded-sheet.png`, `sweep-board-sheet.png`.
  An unprimed critique found no label over geometry that should hide it and no overlaps;
  it caught one over-eager overlap hide, fixed by testing real pill widths.
- **Overlap rule:** two labels clash when their pills intersect or either pill covers the
  other's dot; the pill width is measured from the label layer when known.
- **Occluders:** translucent parts (glass) never hide a label, so `sceneOccluders` takes
  the look. Meshes are tested per triangle behind a per-node bounds check, because a
  node's box (e.g. the board's two-post stand) is far larger than the node.
