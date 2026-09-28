# apps/explainer

The site. It is a React shell around one WebGPU canvas. Visitors whose browser has no
WebGPU, or whose screen is too small, get a short message instead (D20). It ships as a
static Vite build on Vercel.

## How a frame is made

Each step below has one owner. Change a step in its owner, never beside it.

1. **Chapters are data.** Each chapter is one `ChapterDef` in `src/chapters/data/<slug>.ts`.
   The def holds its copy, stats, loop timeline, shot, controls and the scene it builds. The
   ladder order is `chapters/ladder.ts`, and a chapter's display number is its index there
   (D31). `validateChapter` (`chapters/validate.ts`) checks what the types can't: the copy
   budget, the loop budget, and that every anchor, shot, colour and kit primitive a def
   names exists.
2. **Time.** `runtime/clock.ts` is the only reader of the wall clock, and a test enforces
   it. `?clock=held&t=…` freezes it, so every capture is deterministic. The loop (`chapters/timeline.ts`) turns loop time into
   channel values and the active beat.
3. **Model output.** Each scene that shows a model has one run function in
   `runtime/runs/<scene>.ts`. `runtime/scene-run.ts` picks it and owns what a run reads:
   its prompt, its inputs, and the transformer it needs. Anything that runs a network goes
   through the inference worker (`runtime/session.ts`, D38). Table lookups stay on the
   main thread. Every request names its model, and a run's requests are scoped to it
   (`sessionScope`), so a superseded chapter can never touch the next one. Model files are
   fetched once per model, on both threads, and a failed fetch is forgotten so the next
   visit retries (`runtime/once.ts`).
4. **Scene.** `scene/build-frame.ts` is the pure adapter from domain state to the
   renderer's `FrameInput`. Each scene has one builder in `scene/builders/`, and a builder
   composes only the kit primitives its scene declares in `chapters/scenes.ts`. Helpers
   shared between builders live next to them: `parts.ts`, `table.ts`, `scene/ease.ts` and
   `scene/step.ts`. Look there before writing a local copy.
5. **Look.** `src/look/look.json` holds every palette, emissive, bloom, flow and type
   token. The HUD's CSS variables are generated from it, and so is the renderer's
   `LookConfig`. Camera presets are `look/shots.json`.
6. **Stage.** `runtime/stage.ts` is the one frame loop, and the app and every lab page run
   through it: clock → `buildFrame` → orbit → `renderer.frame` → `placeLabels` → the DOM
   labels, which keep clear of the text the scene writes on its parts. `runtime/app.tsx`
   owns the app state, `/#N` routing, the chapter's model and the session. The HUD
   (`src/hud/`) only renders state and sends actions.

## Lab

`/lab/*` is a second Vite entry (`lab/index.html`, router in `src/lab/main.tsx`). It is
built for dev and preview only. Each route is a fixture surface for one visual variable:
a renderer fixture, a kit primitive, one chapter's scene with no HUD, the house style,
the models, the arithmetic, GPU timing and the registry baseline.

`/lab/scene/<slug>` draws the committed run in `src/lab/fixtures/runs/<slug>.json`, so no
inference runs at view time. Regenerate those runs with `bun scripts/scene-run.ts <slug>`.
The tests fail when a run no longer matches what the app computes.

## Verification

The app and the lab both install a probe, `window.__explainer` (`src/lab/probe.ts`).
Through it the harness reads readiness, errors, the renderer's receipt, label placements
and named crops.

- `scripts/verify.ts` opens a route in headless Chrome on the hardware WebGPU adapter. It
  fails on a fallback adapter, a page error, or any console warning. It can also hold the
  clock, shoot named crops, strips and masks. Its header lists the flags.
- `bun run --cwd apps/explainer sheet --variable <crop|full> --chapters all` shoots one
  crop across every chapter, side by side, as a consistency check.
- `bun run --cwd apps/explainer cards` shoots each chapter's link-preview card into
  `public/media/`. ffmpeg is a build-time tool (D41). Re-run it after a look change.
- The `build` script runs `scripts/share.ts` after `vite build`. It writes one static
  share page per chapter (`/c/<N>/`, D34), because crawlers ignore `#` fragments.
- Query flags isolate layers for shots: `?hud=0`, `?labels=0`, `?bloom=0`, `?layers=`,
  `?emissive=0`, and `?arrival=1` to keep the arrival move under a held clock.
- A held clock (`?clock=held`) opens each chapter straight into its lesson's pass and
  never ends it, so shots see the loop. `?lesson=brief` or `?lesson=done`
  opens on the brief card or the reader's turn instead (`src/state/lesson.ts`).

`test/` holds the bun tests. `test/scene-harness.ts` builds a chapter's run and its frame
at a loop time, the same way the app does. Use it rather than a local copy.
