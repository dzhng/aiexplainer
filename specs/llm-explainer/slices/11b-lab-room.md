# 11b — The lab room

**Milestone:** M1 · **Depends on:** 11 · **Visual variable:** the environment (the room
behind and around the subject), not the subject

Added 2026-09-27 from human feedback on the slice-10 hero shot: "put the objects in an
interesting background (a nice room) instead of a blue gradient."

## Contract

Every chapter's machine stands in the same believable, atmospheric room: a small research
lab or workshop at night, in the Night-lab palette. The slice-07 gradient backdrop is
replaced, not layered over. The room frames the subject and never competes with it:

- it is darker and less saturated than the subject;
- only the subject's emissive parts glow brightly;
- the HUD's safe rect stays clear.

The reference is airsup's test cell (`assets/reference/airsup-whole.jpg`,
`airsup-turbopump.jpg`): a bolted back wall, a workbench, practical lights, and depth behind
the subject.

## Seam

- **`assets/blender/lab_room.py` → `apps/explainer/public/props/lab_room.glb`**, built from
  script like every prop. Contents:
  - a floor with a subtle material break (concrete slab seams or floor tiles);
  - a back wall with structure (panels, bolts, conduit or cable trays);
  - one large window or glass partition showing a dim night exterior (a gradient card with
    a few distant emissive city lights, very low intensity);
  - a workbench or plinth where chapter subjects stand;
  - shelving or equipment silhouettes at the edges;
  - 2–3 practical lights (a pendant lamp, strip lights) as emissive parts.

  Node names follow the material-preset convention (`room.floor`, `room.wall`,
  `room.window`, `room.bench`, `room.practical.*`).

- **Ambient occlusion:** baked into vertex colours in Blender (`COLOR_0`), multiplied into
  diffuse by the renderer. Without it, a room with no shadows reads as floating boxes.
  `parseGlb` gains optional `COLOR_0`. Everything else stays uncompressed and untextured, per
  slice 06.
- **`packages/renderer/src/passes/room.ts`** stops drawing the procedural gradient and floor
  disc. The room is an ordinary mesh part set, supplied by the app as the environment:
  `SceneDesc.environment?: AssetId`. The frame function is unchanged. Opaque room geometry
  goes through the prepass like any mesh. The window glass is translucent.
- **`look.json`:** the `room` section now holds environment knobs only: the window-card
  gradient, practical intensities, and an AO strength. The lights are re-aimed so the key
  light still sculpts the subject and the room falls off into darkness.
- **Camera:** `shots.json` presets must keep the room in frame. Orbit clamps (distance and
  pitch) keep the camera inside the room, so it never shows a wall's back face or the void.
- **Scope:** all lab pages that render a scene (`/lab/scene/*`, `/lab/renderer?fixture=board-room`)
  show the room, because the environment is set once in the scene builder's shared helper,
  not per chapter.

## Playable

`/#0` and `/lab/scene/autocomplete`: the tally board standing in the lab.

## Verify

- bun test: `parseGlb` reads `COLOR_0`. The room glb has the named nodes, and its triangle
  budget is ≤ 150k.
- **Shot:** `/lab/scene/autocomplete` at the hero time, full frame, with `?labels=0&hud=0`,
  and the subject masked out (`part:board*` filled flat) so only the environment is judged.
  - **Variable:** the environment: believable room, depth, atmosphere, and not competing
    with the subject.
  - **Out of scope:** the subject's look, labels and copy.
- **Second shot:** the same frame with the subject in, to check the subject still reads first:
  the brightest non-emissive luminance belongs to the subject, and the subject crop's mean
  luminance is higher than the room's.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against
  `assets/reference/airsup-whole.jpg` and `airsup-turbopump.jpg`. Judge environment depth
  and richness, not content.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last
  check.
- **Performance:** GPU frame ≤ 8 ms at 1440×900 with the room in (record the delta vs slice 10).
- **Registry baseline** still holds.
- **Human checkpoint (non-blocking):** the room is the explicit subject of the human's
  request. Open the before/after shots with preview-shots, wait about 5 minutes, then decide
  and record the call here.

## Delegated

The room's specific furniture and layout within the brief above, the window exterior
design, the AO bake settings, and exact practical placements.

## Stays green

01–11, including the approved bloom look on the subject.

## Feedback that would change this slice

A different kind of room (e.g. a warm library, a server hall). The room is a data and prop
swap, since the environment slot is shared.

## Record (2026-09-27)

- **Prop:** `assets/blender/lab_room.py` → `public/props/lab_room.glb` (built by
  `props:build`; byte-identical across builds). It holds a tiled floor with seams, a back wall
  of bolted panels with conduit, wall strip lights either side of a large window right of
  centre, and a night skyline 45–110 m out (a sky card, silhouette blocks and lit windows). A
  workbench sits under a pendant lamp on the right, with shelving and crates on the left and
  ceiling strips overhead. It has about 15k triangles.
- **Bake (a documented widening of the seam):** COLOR_0 is R = ambient occlusion, G = the
  pendant's warm light, B = the strips' and window's cool light. The bake runs in Blender with
  bake-only lights, per vertex (point domain, so it varies smoothly), on one thread (so it is
  deterministic). Emitters get a constant value. AO alone left the room reading as black
  boxes: a renderer with no local lights cannot light walls from their own practicals. The
  renderer multiplies AO into ambient and reflection, and adds the G and B light × the look's
  `room.bake` tints (`room.practicals.*.spill`) to diffuse. The subject has no COLOR_0, so
  it is unchanged.
- **Renderer:** `SceneDesc.environment` is compiled as extra mesh instances in a slot of its
  own, pinned to intensity 1. It is never in `scene.parts`, so it never occludes labels and
  never gets a crop. `passes/room.ts` is deleted, and the background pass remains only as
  the gap fill. The direct lights fall off outside `lights.pool` (radius 2.4 m, falloff
  2.2 m, spill 0.18), so the room stays dim. `OrbitLimits.bounds` keeps the target
  and eye inside `look.room.camera.bounds`: the eye comes in along its ray and returns to
  the asked distance, and the eased pose is kept inside too.
- **Wiring:** `scene/environment.ts` is the one owner. `loadSceneAssets` loads the room,
  `buildFrame` sets it, fixtures opt in with `"environment": true` (`board-room`, and a new
  empty `room` fixture), and the stage uses room orbit limits when a scene has an
  environment.
- **Shots:** all in `throwaway/shots/11b/`.
  - Before is `throwaway/shots/10/hero.png`; after is `hero-after.png` (`/#0` at 5.4 s).
  - `env-masked.png` covers the board with flat grey via the new `verify.ts --mask`.
  - Also: `env-subject.png`, `room-wide.png` (the `room` fixture), `board-room.png`, and
    `boxes.png` (a bare stage fixture, no room).
  - Side-by-sides: `vs-airsup.png` (before, after, airsup-whole) and `vs-turbopump.png`.
- **Subject reads first:** a new `verify.ts --check subject-first` (run with `?emissive=0`)
  gives subject mean 56.9 and p99.9 226.7, against room mean 36.9 and p99.9 90.2. It passes.
- **compare-screenshots** (hero before vs after): black share 0.46 → 0.19, edge energy
  ×1.11, mean luminance +9. Against airsup, the room now has what it had (a dark lab, a night
  window with city lights, practicals, a subject lit in its own pool). It still lacks the
  reference's depth-of-field blur on the background and a workbench surface under the
  subject.
- **screenshot-critique** (two unprimed rounds):
  - The first round found blotchy per-face light blocks, a saturated blue floor–wall line, a
    window competing with the board, and sticker-like city lights.
  - Fixes: a point-domain bake, less metallic walls, a dimmer and less saturated sky, and
    tuned glows.
  - Still open: the floor pool reads as a stage spotlight on empty floor (kept, because it
    frames the subject); there is a warm patch low on the right glass wall; the city is
    simple boxes; the ceiling is dark.
  - Subject-side notes are out of scope here: no contact shadow under the board's feet, the
    `upon` card beside the post, and the HUD covering part of the room in the hero.
- **Performance** (`/lab/perf?fixture=board-room`, 1440×900): 1.44–1.51 ms with bloom,
  against 1.44 ms at slice 08 with the old procedural room, so the delta is about 0. The same
  fixture without the room reads 0.85–1.05 ms. The budget is 8 ms.
- **Registry baseline:** it holds (11 resources before and after, 0 after dispose).
- **Human checkpoint (implementer's call): accepted as the first room.** The follow-ups are
  the open critique items above, plus background depth of field if the human wants the
  reference's softness.
