# 04 — HUD shell on a stub canvas

**Milestone:** M1 · **Depends on:** 02, 03 · **Visual variable:** HUD layout and legibility

## Contract

The reference-style HTML shell renders any `ChapterDef` over a stub canvas: a
flat `--bg` div, with no WebGPU yet. Application state, keyboard input and the
ladder behave correctly. The layout and typography are accepted before any 3D
content competes with them.

## Seam

- **`apps/explainer/src/state/`:** an `AppState` reducer holding `{ chapter, follow, slider, scenario, view, playing, labelMode: 'analogy' | 'precise', precisionOpen, helpOpen }`.
  - Actions: `goto`, `next`, `prev`, `setFollow`, `setSlider`, `setScenario`, `setView`, `togglePlay`, `toggleLabelMode`, `togglePrecisely`, `toggleHelp`.
  - Arriving at a chapter resets its loop and sets `playing: true` (D32).
  - Any control action sets `playing: false` (D32).
- **`apps/explainer/src/hud/`:**
  - **Top left:** the dzhng brand slot, the title "How LLMs work, from first principles" with the chapter title, the why-line, 3 stat chips (each showing its scale), and the caption (2 sentences, plus a "Precisely" disclosure).
  - **Top right:** the Follow row (All plus up to 3, keys 1–4), one slider, the scenario row, the Whole/Cutaway/Exploded row, ▶ and ?.
  - **Bottom:** the chapter ladder (display numbers 0–15).
  - **Corner:** the Analogy/Precise toggle, "Follow on X" and share.
  - **Help panel:** how to use it, and where the numbers come from, including the TinyStories credit.
- **Routing:** `/#N` selects the chapter by display number. ← and → step through the ladder.
- **Styling:** CSS variables come only from `cssVars()`.
- **Stub data:** stat values are computed by stubs for `model`, `arith` and `probe`. The chapter-0 `model` stat reads from the real `counts` model (slice 02).

## Playable

`/#0` in dev shows the full HUD over a flat background. The keyboard and every control work.

## Verify

- **Reducer tests:**
  - → at the last chapter is a no-op.
  - Keys 1–4 map to Follow targets.
  - A control press pauses the loop and ▶ resumes it.
  - `goto` resets the loop.
- **Shots** at 1440×900 and 1280×720. Crops: `panel:tl`, `panel:tr`, `panel:ladder`, `panel:help`.
  - **Variable:** HUD layout, density and type legibility only.
  - **Out of scope:** everything in the 3D area.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) on the HUD crops against:
  - the Night-lab mock (`explore/directions.html`, card 1);
  - `assets/reference/airsup-cutaway-follow.jpg`.

  Judge the panel grammar and density; the mock and reference are targets for form, not pixels.

- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on each crop.
- **Deferred from slice 18:** shoot the stat-chip specimen on `/lab/tokens`, once per scale label (`this tiny model`, `Llama-3-8B`, `Llama-3-8B on H100 SXM`, `TinyStories`), with values from `evalArith`/`formatStat`. **Variable:** scale-label prominence: the scale is legible and can't be mistaken for the value. Run screenshot-critique last.
- **Human checkpoint (non-blocking):** the font and type scale.
  - Delegated default: Inter for the UI, JetBrains Mono for stat values, both self-hosted.
  - Process: preview-shots, wait about 5 minutes, then decide and record the call here.

## Delegated

Component structure, CSS approach (plain CSS modules), exact spacing within the tokens, and icon drawing.

## Stays green

01–03.

## Feedback that would change this slice

Any reaction to the density or type. It only changes `look.json` and the HUD CSS.

## Results (implementation)

- **Shape:** `src/state/` (reducer, keys, `/#N` parsing), `src/hud/` (one CSS module; `Hud`,
  `StatChip`, `Help`, icons), `src/runtime/app.tsx` (reducer, routing, keyboard, model, stage) and
  `runtime/models.ts` (fetch + sha-checked `loadModel`). Layers: canvas `z 0` < labels `z 1`
  (slice 09 mounts `Labels.tsx` between the canvas div and `<Hud>`) < HUD `z 2` < help `z 3`.
  The HUD root is `pointer-events: none`; panels opt back in, so the canvas keeps its input.
- **State:** the listed fields plus `loopEpoch`, which bumps on every arrival. Slice 10's frame
  loop restarts loop time when it changes and advances only while `playing`.
- **D32 as built:** the scene controls (Follow, slider, scenario, view) pause; ▶ / Space resume;
  `goto`, ← and → restart. The reading aids (Analogy/Precise, Precisely, help) don't pause: they
  change the text, not the scene. Arrival resets Follow/slider/scenario/view and closes Precisely;
  the label reading and help stay as the viewer left them.
- **Ladder:** ← / → and the rungs reach written chapters only; unwritten rungs are disabled.
  `/#N` for an unwritten or unknown N lands on the first written chapter and rewrites the hash.
- **Stats are real:** `model` metrics come from `MODEL_METRICS` in `@repo/llm` (`training.tokensSeen`,
  `vocabSize`), `probe` values from the manifest `evidence`, `arith` from `evalArith`. Chapter 0
  shows 486 million (TinyStories) · 8,192 (this tiny model) · 99.9% (this tiny model).
- **`formatStat` `pct` now keeps three significant figures** (0.9991 → "99.9%", not "100%").
- **Fonts:** Inter (latin + greek, `opsz`/`wght` variable) and JetBrains Mono (latin, `wght`),
  self-hosted woff2 from `@fontsource-variable/*` 5.3.0, OFL-1.1 (licences in `public/fonts`).
  The type scale gains `xxl: 34` for the chapter title. **Human checkpoint:** no reply within the
  run; kept the delegated default on the evidence of the crops below.
- **Stat chip:** label (xs, muted) / value (mono lg) / a hairline rule / scale (xs, ink 72%). An
  outlined scale tag read as a clickable button to a fresh reviewer, so it became plain text under
  a rule. Chips size to content and share row tracks (subgrid) so values line up.
- **Harness:** `--crop a,b` (named crops from probe `crops()`, the DOM rects of `data-crop`
  elements), `--press k1,k2`, `--pad`. Shots: `throwaway/shots/04/` (`hud-{1440,1280}-panel-*`,
  `help-*-panel-help`, `full-*`, `keys-3`, `chips-*` from `/lab/tokens?section=chips`).
- **Reviews:** compare against the Night-lab mock and `airsup-cutaway-follow.jpg`: the panel
  grammar matches (title column, 2×2 control grid, centred ladder, corner links). Fixed from the
  critiques: the slider value sits by its track, "keys 1–4" replaces bare digits, scenarios read
  as quoted prompts, icon buttons gained contrast, the corner row is centred on the ladder, the
  help scrim dims more. **Kept, knowingly:** numbers-only rungs for unwritten chapters (they gain
  titles as chapters land), and Analogy/Precise in the corner (the spec places it there).
- **Last check (fresh critique):** no overlap, clipping or overflow at either size; the scale
  under each chip reads clearly as a scale, not the value. Residual polish for slice 10's
  integration pass: chip widths vary with content, the ▶/? buttons are small, and the help panel
  nearly fills 720 px height (it scrolls if it grows).
