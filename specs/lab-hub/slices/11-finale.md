# 11 — The finale

**Visual variable:** tour pacing (filmstrip)

## Contract

When every machine is ✓, the lab offers "Tour the whole machine" (H9): today's tour, run from the hub through the full-scale hall, with the route pipe appearing only now (P13). The chapter 15 page is deleted.

## Seam

- `hall/tour.ts`: `TOUR_ORDER` (today's word-path order), stop pacing, `tourTimeline()`; tour runs load each machine's run as the tour reaches it (with a loading state).
- Delete `chapters/data/finished.ts`, `scene/builders/finished.ts`, `runs/finished.ts`, the `finished` fixtures and card, `ChapterDef.tour`, `SceneBuilder.tourPose`, `finished-wide`, the label-cap tour waiver.
- The tour's three chips move to the lab column during and after the tour.

## Playable

`/` with complete progress → Tour.

## Verify

- Tests: the tour never writes completion; Esc or orbit ends it back in the lab.
- **Filmstrip:** the tour at 1 frame per stop. Variable: pacing.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

Stop dwell times.

## Feedback that would change this slice

Tour pacing.
