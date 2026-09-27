# 11c — A richer room and the arrival camera move

**Milestone:** M1 · **Depends on:** 11b, 13 · **Visual variables:** (1) room richness, then
(2) the arrival move's pacing. Each has its own shot.

Added 2026-09-27 from human feedback on the 11b shots: "the zoom is fine, but richer room,
the user can zoom in & out interactively, and you can also animate starting pulled back then
zoom in when first going to the scene so user still sees the nice room."

## Contract

- **Room richness.** The lab reads as a lived-in night lab, not a sparse box. The hero
  framing is unchanged (the human said "the zoom is fine").
  - More props with silhouettes, in `lab_room.py`:
    - cable runs and conduit;
    - an equipment rack with small blinking indicator LEDs (emissive, low);
    - a desk with a monitor or two (dim emissive screens);
    - a stool;
    - a whiteboard with faint marks;
    - a couple of plants;
    - crates, and a coiled cable on the floor.
  - A skyline with layered depth: 2–3 building rows at different distances, window-light
    variation, and a faint horizon glow.
  - A **soft contact shadow** under every chapter subject: a blurred dark blob or
    ground-projected ambient-occlusion decal, derived from the subject's bounds, so machines
    stop floating.
  - The room still stays darker and less saturated than the subject (11b's subject-first
    check stays green).
- **Arrival move (D42).** On arriving at a chapter, the camera starts at a wide `room-wide`
  shot showing the room, then eases in to the chapter's hero shot over about 2.5 s.
  - This is part of the loop's first pass only: the loop's own beats start after the move
    (the loop clock begins at 0 when the move ends), so the D24 10-second point is still
    measured from the move's end.
  - Any orbit, zoom or pan input during the move cancels it immediately and hands control to
    the user.
  - A held clock (`?clock=held`) and the recorder skip the move unless
    `?arrival=1` is given, so every existing hero shot stays deterministic.
  - Interactive orbit, zoom and pan stay available at all times, within the 11b room bounds.

## Seam

- `assets/blender/lab_room.py` (props, skyline). The triangle budget rises to ≤ 250k.
- `packages/renderer/src/kit/contact-shadow.ts`: one primitive, built from a `Box3`. It is
  drawn in the translucent phase with depth read and no depth write.
- `apps/explainer/src/runtime/stage.ts`: owns the arrival tween, a pure `arrivalPose(from,
to, t)` with ease-in-out. `shots.json` gains `room-wide`.

## Verify

- **Shot 1** (room richness): `room-wide` with the subject hidden. Run compare-screenshots
  against `assets/reference/airsup-whole.jpg` and against 11b's `room-wide` (before/after).
  Run screenshot-critique last.
- **Shot 2** (arrival): a filmstrip at 0.25 s steps over the move with `?arrival=1`.
  - Judge pacing and ease only: no pop, the room is readable at the start, and the landing
    matches the hero shot exactly.
  - Run screenshot-critique last.
- **Shot 3** (the subject's contact shadow): crop around the feet of the chapter-0 board.
  - Judge grounding only.
  - Run screenshot-critique last.
- **bun tests:**
  - `arrivalPose` at t=0 equals `room-wide`, and at t=1 equals the hero pose.
  - Input cancels the move.
  - A held clock skips it.
- **Performance** ≤ 8 ms GPU. The registry baseline holds, and the subject-first check stays
  green.
- **Human checkpoint (non-blocking):** before/after room shots and the arrival strip.

## Delegated

Prop choice and placement within the list above, the skyline design, shadow softness, and
the move's duration (2–3 s) and ease.
