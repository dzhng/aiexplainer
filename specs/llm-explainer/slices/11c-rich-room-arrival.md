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

## Record (2026-09-27)

- **Room** (`lab_room.py`, ~31k triangles; the budget test is now ≤ 250k):
  - New props: an equipment rack with green indicator LEDs; a desk against the back wall
    with two dim monitors; two stools; a whiteboard with marker lines; two plants; crates by
    the rack; a coiled cable with a floor run; a cable tray.
  - Skyline: three rows of blocks at 40, 75 and 120 m, the far rows hazier, with lit windows
    on a floor grid and a horizon glow. The blocks' bases sit far below the sill, so nothing
    floats.
  - Screens and LEDs are glow-only practicals (`look.room.practicals.screen` and
    `indicator`); the screens also cast into the cool bake.
- **Contact shadow:** `kit/contact-shadow.ts` is a kit primitive (`contactShadow`).
  - It is a new `shadow` part kind: a unit footprint whose per-vertex coverage fades
    (superellipse) to its edge.
  - It is sized from the subject's bounds plus a soft margin, and drawn in the translucent
    phase with the `shadow` preset (opacity 0.7).
  - Materials gain `specular`; the shadow's is 0, so it only darkens.
  - Chapter 0's scene now builds on it, and `SCENE_KIT` lists it.
- **Arrival (D42):**
  - `runtime/arrival.ts` holds the pure `arrivalPose` (smoothstep, shortest yaw, distance
    eased in log space) and an `Arrival` object. `stage.arrive(pose, from, 2.5)` drives it.
  - Any orbit press or wheel cancels the move.
  - The loop clock is paused while the move runs, so the loop's 0 is the landing.
  - `arrivalFromSearch`: a held clock skips the move unless `?arrival=1`.
  - `shots.json` gains `room-wide`, and the `room` lab fixture uses it.
- **Shots:** all in `throwaway/shots/11c/`.
  - Room: `room-before.png` → `room-after.png` (side by side in `room-pair.png`), plus
    `vs-airsup.png`.
  - The arrival filmstrip: `arrival-strip.png` (0.25 s steps).
  - Feet: `feet-pair.png` (11b hero on top, 11c hero below).
  - Also `env-subject.png`, `hero-after.png`, and the crops `crop-*.png`.
- **Checks:**
  - Subject-first: subject mean 53.7 / p99.9 224.4 against room 34.6 / 88.2. It passes.
  - GPU 2.3 ms (≤ 8 ms). The registry baseline holds.
  - compare-screenshots, room before → after: edge energy ×1.12, same luminance.
- **Critique:** one unprimed round, then fixes.
  - Fixed: floating skyline blocks (bases lowered), and a slow start in the move
    (smootherstep → smoothstep).
  - Shadow: tightened, but it is still a blob, not per-foot contact.
  - Accepted and still open:
    - the shelf props are plain boxes;
    - the floor pool reads as a stage spotlight;
    - there is warm pendant spill low on the right wall;
    - the ceiling tubes have no hangers;
    - the "once" card tag is hidden for about 1 s mid-move (the card is off-frame until the
      loop starts at landing).
- **Human checkpoint (implementer's call): accepted.** The before/after room shots and the
  arrival strip are listed above.

## Polish pass (2026-09-27)

The room items from the polish backlog, one visual variable each, judged on all 16 heroes
(`/#N` at each chapter's OG time) before and after. Shots: `throwaway/shots/polish-before/`
and `polish-room5/` (and `*-grid.png`, `*-tl.png`), the room in `polish-before/room-wide.png`
→ `polish-after/room-wide.png` (shelf crops `room-wide-shelf.png`).

- **Floor pool → pooled light.** The pool's edge is now a long, soft falloff (radius 0.8 m,
  falloff 3.4 m) stretched 1.6× along x, the ceiling tubes' axis (`lights.pool.stretch`, a
  new look field packed into the look uniform's spare lane). No hard disc; hero luminance
  moves by at most 2.5/255. Subject-first stays green (chapter 0: subject 53.2 / 233.7
  against room 35.8 / 86.2; chapter 8: 52.1 / 226.2 against 31.7 / 93.8).
- **Shelf props.** The plain boxes are gone: ring binders (two runs, one leaning, paper
  labels and finger holes), stackable parts bins with parts showing, hard equipment cases
  (lid seam, latches, grip; also the three beside the rack), and a spare monitor. New room
  presets `binder`, `binderAlt`, `paper`, `bin`, all dim and desaturated.
- **Contact shadow per contact.** `contactShadow` takes `feet` (world boxes; `blockFootprint`
  turns a floor-standing block into one): each gets a tight footprint, and the body's
  footprint turns into a faint ambient one (`shadowAmbient`, opacity 0.35). Used by the
  tables (chapters 1–3), the tally board's feet (0), the panel's legs (6) and the board, lens
  and machines (12). Left as one blob, with reason: chapters 7, 9–11 and 13–15, whose
  bodies sit on or near the floor (river, rail, bus body, desks, bays), where one soft
  footprint is the right contact.
- **Nothing busy behind the top-left HUD text.** The long bright horizontals left of the
  window (the strip light and the two conduit runs) crossed the kicker or title in
  chapters 6, 9, 10 and 13 (13 was struck through). The conduit now starts at the window
  and drops beside it to its junction box, and the left strip light is gone. Tried and
  dropped: a shorter strip (still under chapter 13's kicker) and wall sconces (under
  chapters 0, 4, 5, 7 and 14's text). The top shelf keeps only a case at its right end.
  Left as is: the plant's dark leaves behind chapters 1 and 3's titles (low contrast), a few
  rack LEDs under chapters 4–5's second caption line, and shelf edges at chapter 2's top-left
  corner, none crossing text.
- **Critique (unprimed):** B (after) had fewer defects in 5 of 6 pairs and the sheet was a
  tie. Fixed from it: the floor read flat (pool tightened), thin legs' pads read as round
  blobs (default foot softness 0.12 → 0.06), the board's plates lacked contact (0.18 for
  them), book stacks behind chapter 4's caption (removed). Left: the junction box beside the
  window in chapter 1 (a wall fitting beside the title, not behind it) and the left back
  wall reading plainer in `room-wide` (deliberate: it sits behind the HUD).
