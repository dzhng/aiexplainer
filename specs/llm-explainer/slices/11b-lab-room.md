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
