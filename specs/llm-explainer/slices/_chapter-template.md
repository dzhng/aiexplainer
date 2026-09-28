# Chapter slice template (slices 19–35 inherit this)

Every chapter slice ships one chapter as data plus one scene builder, composed
only from the locked vocabulary (slice 13). What a chapter file states on top of
this template:

- its model and probe;
- its new kit primitive, if any;
- its loop beats and its one visual variable;
- anything it deliberately leaves out.

## Seam (the same for every chapter)

- `apps/explainer/src/chapters/data/<slug>.ts`: a `ChapterDef` that passes `validateChapter`.
- `apps/explainer/src/scene/builders/<slug>.ts`: `(def, timelineState, ui, run) → FrameInput` parts and dynamics. It is pure.
- `apps/explainer/src/lab/fixtures/runs/<slug>.json`: a committed fixture run (real model output, taken from the worker) for `/lab/scene/<slug>`.
- A new kit primitive goes in `packages/renderer/src/kit/<name>.ts` and gets its own `/lab/kit/<name>` turntable.
- Copy follows the README [copy rules](../README.md#copy-rules):
  - the why-line names the previous chapter's visible failure;
  - the loop's last beat shows **this** chapter's failure, which motivates the next one.

## Order of work inside a chapter slice

1. **Kit primitive, if new.** Take a turntable shot on `/lab/kit/<name>` with `?emissive=0&bloom=0`.
   - **Variable:** silhouette only.
   - Run screenshot-critique last.
2. **Scene at the hero time** on `/lab/scene/<slug>?clock=held&t=<hero>`.
   - **Variable:** the chapter's named variable, on its named crop or mask.
   - Run compare-screenshots against the `bun run --cwd apps/explainer sheet --variable full --chapters all` contact sheet, to catch drift from the house style.
   - Run screenshot-critique last.
3. **Loop filmstrip** at 1 fps with caption beats (`verify.ts --strip`).
   - **Variable:** pacing. The point lands by 10 s, and the loop is 20–30 s (D24).
   - Run screenshot-critique last.
4. **Label sweep**, 12 azimuths, cropped to the union of `label:*`.
   - **Variable:** legibility and occlusion of this chapter's labels.
   - Run screenshot-critique last.
5. **Honesty check** (bun test): every number the chapter shows equals its source:
   - the worker's `forward()` on the scenario prompt;
   - or the probe value in the manifest `evidence`;
   - or the `arith` result.

   Every scenario prompt cites a passing probe, or the chapter uses D33 copy.

## Verification that always applies

- `validateChapter` passes.
- The `buildFrame` snapshot test for the hero time passes.
- All earlier chapters' hero shots are unchanged, per the sheet.
- The registry baseline holds across `goto` in and out of this chapter 10 times.
- Performance budgets hold (README).
- **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot above**, unprimed, before accepting the slice.

## Delegated to the implementer in every chapter

- Builder geometry constants, which live in the chapter data file.
- Easing within beats.
- Copy wording within the copy rules.
- Which of the probe-passing prompts are the default and which are the scenarios.

Anything else goes in the README choices ledger.
