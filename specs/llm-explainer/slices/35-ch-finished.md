# 35 — Chapter 15 · `finished` — the finished machine

**Milestone:** M4 · **Depends on:** 34 · **Visual variable:** whole-frame composition. This is the first whole-frame judgement of a chapter, now that every part has its own evidence.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 15 · `finished` is playable at `/#15`, backed by its real model and passing the template's checks.

## Model

all (the builder composes the earlier builders' parts; there is no new inference path).

## New kit primitive

none new

## Loop beats (20–30 s)

1. The camera tours the full machine: bricks, pins, pipes, clock hands, lamps, river, stack, note rack, bus, dice, experts.
2. Each part pulses with its label in the current reading.
3. The final chip row shows this tiny model vs Llama-3-8B.

## Notes and scope

Also audits D21: summing the loop durations of all 16 chapters must come to ≤ 10 minutes including transitions. Record the total here.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the composed parts are the union of the earlier builders' outputs, with no duplicated owners.
- The ladder skim total is ≤ 10 minutes.
- compare-screenshots runs this chapter's frame against the sheet of all hero shots, and against `assets/reference/airsup-whole.jpg` for overall composition.

## Delegated

The tour order.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Results (2026-09-27)

- **Composition, no new inference path.** `scene/builders/finished.ts` owns no chapter part: each station is its chapter's scene, built and updated by that chapter's own builder through `buildFrame` into a frame of its own (its own loop time, its own run), then copied into one scene: ids prefixed `<slug>/`, slots offset, transforms scaled and placed on the floor. Its only part of its own is the route (a floor pipe with flow pulses, station to station in tour order). The run (`runtime/runs/finished.ts`) is every station's own `computeRun` on its own model; `RunContext.source` loads other models once, and the app now tracks every worker load (a run that loads models no longer leaves the app believing the worker holds its chapter's).
- **Tests** (`test/finished-chapter.test.ts`): stations = every other written chapter; the composed parts are exactly each station builder's parts (ids, kinds, primitives, placed transforms) plus the route; the kit is the union; each station's run equals its own chapter's run and fixture; labels are the stations' own words; at each stop only that station's label and scene text show and it outshines the rest; the camera frames each stop with its chapter's shot scaled down; D21 total ≤ 600 s.
- **Tour (delegated order):** the path a word takes, then the serving tricks: tally board (where it began), bricks, pins, pipes, clock hands, question panel, expert bays, river, assembly line, die, generation rail, (KV notes), junior, crates, bus. Stations stand on a 5-wide serpentine grid; each stop reuses its chapter's hero shot (the stack's pull-back shot) scaled with the station, pitched down ≥ 0.6 rad so the row in front never blocks it. The station in view breathes (× 1.3–2.1 emission), the rest dim to 0.15, and each station's loop is offset so its link-preview moment plays as the camera arrives. The slider picks a stop; orbiting hands the camera to the reader until the loop restarts or the slider moves.
- **Seams:** `ChapterDef.tour` + `SceneBuilder.tourPose`; a stage `update` may return true (it steered the camera; the orbit continues from there) and `onOrbitInput`; `Labels` hide labels whose anchor left the scene. The validator's 5-label cap is waived for a toured chapter (one label shows at a time). Fixed on the way: the app only ever loaded the first chapter's props, so arriving at the board or bus chapter from elsewhere never drew them.
- **Chips:** weights, all parts: `full` 1.51 million (this tiny model) vs 8.03 billion (Llama-3-8B); blocks: 32 (Llama-3-8B).
- **Performance** (`/lab/perf?scene=finished&t=…`, 1440×900): 2.3–2.9 ms GPU with bloom (≤ 8 ms), the busiest scene (~2,500 parts, ~600 draws). p95 frame 16.7 ms in the app. Registry holds at 11 buffers across 10 round trips 14 → 15 → 14.
- **D21 audit:** 15 written chapters' loops sum to 361.0 s (attention 30, finished 28.0, sampling 26 longest), plus 15 × 2.5 s arrival moves = **398.5 s (6 min 38.5 s)**. With chapter 10 (≤ 30 s) and the finished loop at 15 stations (29.6 s) the ceiling is 432.6 s (7 min 13 s): within 10 minutes; no chapter's loop needs shortening.
- **Visual gates:** compare-screenshots vs the hero sheet and `airsup-whole.jpg`: palette, coverage and centroid on-style; drifts: no single focal subject, overhead camera, subject clipped at the right. Fixed: grid tightened into the safe area, the route added to read as one machine. Kept: the wide overhead shot (a whole machine cannot be one hero object). screenshot-critique (unprimed): fixed the camera lagging its beat (beats now at arrival, 1.6 s per stop), invisible dimming (dims while moving too, 0.15), the experts stop's foreground boxes (steeper pitch), the wrapped third chip. Left as is: the stations' own scene text on their geometry (their chapters' look), a few stops' subjects near the left HUD edge (their hero shots' own offset). Label sweep at the attention stop: shown at 10 of 12 azimuths (occluded at 60°, yields to scene text at 270°).
