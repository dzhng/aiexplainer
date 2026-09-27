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
