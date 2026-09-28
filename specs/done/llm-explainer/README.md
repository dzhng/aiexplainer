# How LLMs work, from first principles

An interactive 3D explainer for software engineers with no ML background. It starts
from the simplest thing that can predict text (word-pair counts) and adds one part per
chapter until it reaches a production LLM. Each part is drawn as a real tensor machine
that _behaves like_ an everyday analogy (water pipes, dice, clock hands, a bus), and each
chapter is backed by a real tiny model trained for it.

It is live at https://aiexplainer-red.vercel.app (the `main` branch). The spec closed on
2026-09-28, with all 16 chapters shipped.

This record holds the _why_: the decisions, the principles that must keep holding, the
dead ends, and the visual standard. The code holds the _how_. Start from the workspace
READMEs: [apps/explainer](../../../apps/explainer/README.md),
[packages/renderer](../../../packages/renderer/README.md),
[packages/llm](../../../packages/llm/README.md) and
[training](../../../training/README.md).

Also in this folder:

- [choices.md](choices.md): every choice the implementation made where the plan was
  silent, grouped by verdict. It includes the incidents the human should know about.
- [explore/map.html](explore/map.html): the explore map from 2026-09-27. It is the
  source of D1–D30 and L1, with their original evidence. Its OPEN table, tweakable
  plan and kickoff prompt are history.
- [explore/directions.html](explore/directions.html) and
  [explore/game-ui.html](explore/game-ui.html): the look and HUD mocks the human
  picked from (see [Visual provenance](#visual-provenance)).
- [assets/reference/](assets/reference/): the airsup.ai frames the style was matched
  against.

## Why it exists

Existing explainers either show every matrix with heavy jargon (bbycroft.net/llm),
explain GPT-2 at medium jargon (the Poloclub Transformer Explainer), or are video only
(3Blue1Brown). None of them gives each component its own model, or carries on into
production serving. This one is a progressive build (D4): every chapter shows the
previous chapter's visible failure, adds one part, and shows that it now works better.
The style reference is airsup.ai/rocket-engine: one dark room, a Follow row, a slider,
a scenario row, Whole/Cutaway/Exploded views, pinned labels, and numbers whose source
is stated in the help panel. After release, readers found the extra controls confusing,
so the view row and every slider that was not a real knob of the mechanism were removed
(see [Amendments after release](#amendments-after-release-2026-09-28)).

**Non-goals:** a training chapter (D8), 3D on phones or a WebGL fallback (D20, D29),
running a production model in the browser, any server, localisation, and backward
compatibility (the project is greenfield: hard cutovers, no shims).

## Chapters

Chapter ids are slugs. The display number is the chapter's index in
`chapters/ladder.ts` (D31), and deep links use it (`/#4`). The explore map numbers the
chapters 0–8 and then 10–16, because it kept a gap for the cut training chapter.

| #   | Slug           | Adds                          | Analogy                                    | Model                          |
| --- | -------------- | ----------------------------- | ------------------------------------------ | ------------------------------ |
| 0   | `autocomplete` | Word-pair counts              | Phone autocomplete                         | `counts`                       |
| 1   | `tokenizer`    | Tokenizer                     | Lego bricks from a fixed box               | the shared tokenizer           |
| 2   | `embeddings`   | Embeddings                    | Pins on a map                              | `embed` (its input half)       |
| 3   | `sampling`     | Output + sampling             | Loaded dice                                | `embed`                        |
| 4   | `attention`    | Attention                     | Pipes that open wider on a match           | `attn` (1 layer, no positions) |
| 5   | `positions`    | RoPE                          | Clock hands turned by position             | `rope` (1 layer)               |
| 6   | `mlp`          | MLP                           | A panel of yes/no questions                | `mlp`                          |
| 7   | `residual`     | Residual + RMSNorm            | A river each station pours into            | `residual`, `noresidual`       |
| 8   | `stack`        | Heads + layers                | Several readers; an assembly line          | `full` (GQA)                   |
| 9   | `generation`   | The generation loop           | Rereading the page before every word       | `full`                         |
| 10  | `kv-cache`     | KV cache, GQA, sliding window | Sticky notes; readers share notes          | `full` + Llama arithmetic      |
| 11  | `batching`     | Prefill vs decode, batching   | A bus: one trip costs the same for 1 or 64 | arithmetic only                |
| 12  | `quantization` | Quantization                  | A lower-resolution photo                   | `full-q8`                      |
| 13  | `speculative`  | Speculative decoding          | A junior drafts, the senior checks         | `drafter-64` + `full`          |
| 14  | `experts`      | Mixture of experts            | Hospital triage                            | `moe`                          |
| 15  | `finished`     | The finished machine          | Every part, still labelled                 | all of them                    |

## Decisions

Every decision below is implemented, or needs no code. They were reconciled against
the shipped code when the spec closed.

### From the explore map (D1–D30, L1)

The full wording and evidence are in [explore/map.html](explore/map.html).

| #   | Decision                                                                                                                       | Where it lives                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| D1  | The screen shows a machine built from real tensors, explained with physical analogies.                                         | `scene/builders/*` draw `runtime/runs/*` output                                       |
| D2  | The audience is software engineers with no ML background; every term of art is defined at first use.                           | chapter copy (no validator can check this)                                            |
| D3  | The title is "How LLMs work, from first principles".                                                                           | `look/brand.ts`                                                                       |
| D4  | A progressive build: each chapter fixes the last one's visible failure.                                                        | `chapters/ladder.ts`; each def's `why` line                                           |
| D5  | The camera stays in one block; "this repeats 32 times" is one brief zoom-out.                                                  | `ChapterDef.pullBack`, used by chapter 8 only                                         |
| D6  | Tokenizer, embeddings, positions, batching, quantization and MoE are all in.                                                   | the ladder                                                                            |
| D7  | Analogies assume high school, never electrical engineering; the precise claim follows and is never replaced.                   | `Caption.story` + `precisely`                                                         |
| D8  | No training chapter.                                                                                                           | no code needed                                                                        |
| D9  | Real tiny models, run on the CPU in TypeScript; production numbers are Llama-3-8B arithmetic. Amended by D26.                  | `packages/llm`, `packages/llm/src/scale/`                                             |
| D10 | The renderer is TypeGPU on WebGPU: no three.js, no WebGL. React only draws HTML panels.                                        | `packages/renderer`                                                                   |
| D11 | Blender scripts build the static props; anything shaped by model data is procedural TypeScript.                                | `assets/blender/*.py`, `packages/renderer/src/gltf.ts`, `kit/`                        |
| D12 | Free exploration: every control is live. Each chapter header names the previous chapter's failure.                             | `ChapterDef.why`, shown by the HUD                                                    |
| D13 | Deploy to Vercel as a static Vite build.                                                                                       | `apps/explainer/vercel.json`                                                          |
| D14 | Build chapter 0 end to end first.                                                                                              | no code needed (build order)                                                          |
| L1  | Workspaces: `apps/explainer`, `packages/renderer`, `packages/llm`, `training/` (uv), `assets/blender/`.                        | the repo layout                                                                       |
| D15 | The look is Night lab: dark navy studio, glowing violet and amber flows, bloom, glass and metal.                               | `look/look.json`, the bloom pass                                                      |
| D16 | A tensor machine that behaves like the analogy; an Analogy/Technical toggle swaps label readings.                              | `LabelDef.analogy`/`technical`; `validateChapter` requires both                       |
| D17 | Storyteller voice, then a "Technical" line.                                                                                    | caption copy                                                                          |
| D18 | Label key parts only: at most 5 per chapter.                                                                                   | `validate.ts` `MAX_LABELS` (waived for the toured chapter, which shows one at a time) |
| D19 | Made to post on X: deep links and link-preview images.                                                                         | `/#N`, `scripts/share.ts`, `public/media/`                                            |
| D20 | Desktop only; small screens get the fallback page.                                                                             | `runtime/support.ts` `detectSupport`                                                  |
| D21 | About 10 minutes to skim the ladder.                                                                                           | 16 loops plus 16 arrival moves come to about 7 minutes                                |
| D22 | v1 is all 16 chapters.                                                                                                         | `chapters/index.ts`                                                                   |
| D23 | Branded dzhng, with "Follow on X"; no airsup name or implied affiliation.                                                      | `look/brand.ts`                                                                       |
| D24 | Each chapter plays a 20–30 s loop on arrival; captions are 2 sentences with "Technical" behind a click.                        | `validate.ts` (`LOOP_SEC`, `checkCaption`)                                            |
| D25 | Nothing on screen is faked. Prompts are chosen by running the models; every number names its scale.                            | `chapters/stats.ts`, `STAT_SCALES` (`types.ts`); probes in `training/probes/`         |
| D26 | The drafter is the smallest full-architecture model; the best measured acceptance wins.                                        | `training/configs/drafter-64.toml`                                                    |
| D27 | Speed comes from Llama-3-8B arithmetic on a named GPU; browser timing is never shown as speed.                                 | chip values can only be model, arith or probe                                         |
| D28 | One tokenizer for every model; chapter 0 counts whole words.                                                                   | every neural model's manifest points at the same `tokenizer.json` hash                |
| D29 | The fallback plays a recorded video of the real app, with a "copy link" button.                                                | `fallback/Fallback.tsx`, `scripts/record.ts`                                          |
| D30 | `training/` is a uv project with pinned torch on MPS; exported weights are committed; `typegpu` and `math` are pinned exactly. | `training/pyproject.toml`, `apps/explainer/public/models/`, the root `catalog`        |

The map's sharp edges are also rules, and they hold. The MoE model trains with a
load-balancing loss, and export refuses a collapsed router (`balance_loss` in
`training/model.py`, `moe_export_gate` in `train.py`). The harness runs real Chrome
with hardware WebGPU and fails on any console warning (`scripts/harness.ts`). Labels are
hidden by a CPU occlusion test using the same camera function as the GPU, and bloom and
orbit are built by hand (`labels.ts`, `passes/bloom.ts`, `orbit.ts`).

### Made while slicing and building (D31–D42)

| #   | Decision                                                                                                                                                                                           | Why                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D31 | On screen, chapters are numbered 0–15 by ladder index. Code uses slugs. Deep links use the display number.                                                                                         | Links become permanent once posted, so the numbering had to be fixed before the first post.                      |
| D32 | Arriving at a chapter restarts its loop. Any scene control pauses it, and ▶ resumes it. There is no idle auto-resume.                                                                              | Free exploration (D12) and auto-play (D24) needed a rule; the scene must not move under a reader's hand.         |
| D33 | If a model fails its probe after bounded retries, the chapter still gets a loop that shows the honest result and says so.                                                                          | A chapter with no effect still has to show something, and it must not fake one.                                  |
| D34 | Each chapter has a static `/c/<N>/index.html` with its own link-preview metadata, which redirects to `/#N`.                                                                                        | Crawlers ignore URL fragments, so `/#N` alone can't carry per-chapter preview images. Amends D29.                |
| D35 | The chapter-4 and chapter-5 models have one layer.                                                                                                                                                 | With several layers, causal attention can infer position without RoPE, so "order doesn't matter" would be false. |
| D36 | The `full` model uses GQA. It is also the source for the quantized copy and the target for speculative decoding.                                                                                   | Chapter 10's "readers share notes" has to be real. One trained model underlies chapters 8–10, 12, 13 and 15.     |
| D37 | The chapter-2 scene uses the `embed` model's embedding table.                                                                                                                                      | Its pins must be real vectors.                                                                                   |
| D38 | Inference runs in a cancellable Web Worker, on the CPU.                                                                                                                                            | Controls stay responsive while a typed prompt runs; no GPU inference (D9).                                       |
| D39 | No workspaces beyond L1. Chapter data, timelines and look tokens live in `apps/explainer`.                                                                                                         | A `packages/chapters` would have one consumer.                                                                   |
| D40 | The lab routes (`/lab/*`) are a second Vite entry, built for previews only.                                                                                                                        | Each visual variable needs a fixture page that doesn't boot the whole app.                                       |
| D41 | ffmpeg (Homebrew) is a build-time tool for the fallback videos, never used at runtime.                                                                                                             | D29 needs recordings.                                                                                            |
| D42 | Each chapter opens on a wide room shot and eases in to its hero shot (2.5 s); the loop starts when the move ends. Camera input cancels it; held clocks and recordings skip it unless `?arrival=1`. | The human asked for it. It shows off the room without costing the loop budget.                                   |

### Human notes

- **The bloom look was approved** on the chapter-0 board ("bloom effect looks great").
  The `look.json` bloom and emissive values are that baseline.
- **Put the machines in a nice room, not a blue gradient.** This produced the shared lab
  room that every chapter stands in.
- **"Richer room … animate starting pulled back then zoom in … make the UI look like a
  game UI, not some b2b saas".** This produced the rich room, contact shadows, the
  arrival move (D42) and the holo-tactical HUD.
- **Chapter 4 uses name recall, not pronouns (D33).** The one-layer `attn` model does not
  send "she"/"he" attention to the character (0.58× an even spread, a fail). It does
  attend from a point where a character's name comes next back to that name's earlier
  mention (2.98×, a pass). Chapter 4's example and copy use name recall and make no
  pronoun claim. Both probe sets are recorded in the `attn` manifest.
- **"No need for public domain, and I disabled vercel auth."** There is no custom domain,
  and previews and production are both public. `SITE_URL` is set for the production
  target so link-preview cards use the stable domain.
- **"You can merge to main whenever you want."** The release was a fast-forward of `main`
  after the release candidate was green.

### Resolved questions

- **O1:** TinyStories is licensed CDLA-Sharing-1.0, so training on it and publishing the
  weights is fine. The raw data stays out of git, and the help panel credits it.
- **O2:** every trained transformer's example prompts are measured into its `scenarios.json`; chapter 0's prompt cites the counts model's top-successor probe.
- **O3:** the drafter is `drafter-64` (held-out acceptance 0.601, expected speedup 1.24×).
- **O4:** the reference GPU is the H100 SXM: 3.35 TB/s, about 989 dense BF16 TFLOPS, 80 GB
  (`packages/llm/src/scale/data/h100-sxm.json`).
- **O5:** production is https://aiexplainer-red.vercel.app, with no custom domain.

## Amendments after release (2026-09-28)

The human reviewed the live site and asked for five changes. Each landed as its own
commit; the ledger entries are in [choices.md](choices.md) ("Amendments").

- **The label toggle says what it does, and "Precise" is "Technical".** "Add a
  description so people know what this does, rename precise to technical." The toggle
  is captioned "Labels" with a tooltip ("the everyday analogy or the technical term").
  The caption's "Precisely" disclosure is the same concept, so it is "Technical" too,
  and the code names follow with no aliases (`labelMode: "technical"`,
  `LabelDef.technical`, `Caption.technical`). This amends D16, D17 and D24's wording.
- **Chapter 0's board names its lookup and holds the whole text.** The empty header
  strip reads "After “little”…", so the bars read as that word's row of the tally; the
  rail shows the reader's whole text with the earlier words muted and the last word on
  the lit card, the only word the machine looks at. The "The tally board" label was
  deleted: it pointed at the whole board and confused the human. The loop's inputs are
  whole texts ("once", "once upon", "once upon a", then "onse").
- **Controls cleanup: only real knobs, and no view row.** "Why are these useful for the
  user? it just seem like they make it more confusion with more buttons." A chapter's
  slider is now optional, and stays only where it is a real knob of the mechanism:
  temperature (3), riders (11), bytes per weight (12), draft length k (13), and chapter
  10's new window (notes kept per block: 4–8 words or all, each stop a real
  generation). The display sliders are gone and their scenes show their natural
  content. Chapter 5's order swap is two Try chips. The Whole/Cutaway/Exploded row is
  gone from every chapter, and the view machinery was deleted end to end (view state,
  `FrameInput.view`, explode offsets, the cut plane, the hatched cap and its pipeline
  variants). Chapter 8's pull-back (D5) is a camera move, not a view, and stays. This
  retires the reference's "one slider per chapter, three views" control grammar.
- **A real model is visibly running, and typing is the call to action.** "Make it
  obvious … that you are running an actual LLM, and really encourage people to type
  here." The text box leads with a LIVE light, says honestly what runs in the browser (a
  word-pair counts model in chapter 0, the tokenizer in chapter 1, a tiny language
  model from chapter 2 on), and after a run names the model with numbers read off it.
  No time is shown (D27). Chapters without a model show no box.
- **One story panel.** "Group ALL user interactions/controls together into one panel,
  so it reads like a story top to bottom." Under the caption, in the left column: 1
  type your own text, 2 or try an example, 3 turn the knob (with a one-line hint), 4
  follow a part, then the label wording, play and help. Steps a chapter lacks are left
  out and the numbers count what is shown. The top-right panel is gone, so the scene
  keeps the right side; the safe rect is everything right of the column, and the
  ladder centres between the column and the corner links. A right-hand column was
  rejected because the shots frame the machines centre-right.

## Principles

**Honesty is structural, not editorial.** Every number on screen comes from one of three
places: a model metric, a probe the model passed, or arithmetic over cited constants
(`chapters/stats.ts`). A number typed by hand can't be represented in a stat chip, and
every chip names its scale ("this tiny model", "Llama-3-8B", "Llama-3-8B on H100 SXM",
"TinyStories"). A chapter's art was never built before its model passed the probe that
shows the effect (D25). When an effect doesn't show, the chapter says so (D33).

**The analogy leads; the precise claim is never replaced.** Captions are 2 storyteller
sentences of at most 25 words each, with a "Technical" line behind one click;
`validateChapter` enforces the budget. These qualifiers are binding:

- Chapter 4: attention weights _show_ what a word draws from; they are not proof of
  meaning.
- Chapter 5: "with one attention layer and no positions, shuffling the earlier words
  doesn't change the prediction" (D35).
- Chapter 6: "a lot of what the model knows is stored here", never "facts live here".
- Chapter 10: the sliding window changes outputs, and is not how Llama-3-8B runs.
- Chapter 14: MoE numbers use named assumptions (`llamaAsMoe`); Llama-3-8B is not an MoE.

**Browser time is never speed (D27).** A tiny model on a CPU isn't limited by memory,
so browser timings would teach the wrong lesson about serving. What happens to tokens is
real; how fast is roofline arithmetic.

**Chapters are data, and the vocabulary is locked.** A chapter composes from existing
colour tokens, shots and kit primitives. It can't invent one; adding one is a kit change
with its own review. `validateChapter` rejects unknown anchors, shots, colours and
primitives.

**Every capture is deterministic.** Time comes from one clock, which can be held or
stepped, so shots, videos and cards reproduce byte for byte.

## Invariants

Each concept has exactly one owner. A second copy is a bug.

| Concept                                                                                 | Owner                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPU device, capabilities, resource registry, frame targets, pass order, reverse-Z depth | `packages/renderer` (`device.ts`, `registry.ts`, `frame.ts`)                                                                                               |
| Camera matrices, `project()`, orbit pose math, occluders, label placement               | `packages/renderer` (`camera.ts`, `labels.ts`), on the CPU; GPU packing, labels, crops and picking all call them                                           |
| The renderer boundary: `FrameInput`, `Renderer`, `FrameReceipt`                         | `packages/renderer/src/frame-input.ts`                                                                                                                     |
| Kit primitives: geometry, bounds, anchors                                               | `packages/renderer/src/kit/`, one `build()` per primitive                                                                                                  |
| glTF parsing; tuple → `Float32Array` packing                                            | `packages/renderer/src/gltf.ts`; `pack.ts`                                                                                                                 |
| Model manifest format and tensor names                                                  | `packages/llm/src/manifest.ts`, which emits a JSON Schema the Python exporter conforms to                                                                  |
| Tokenizer runtime                                                                       | `packages/llm/src/tokenizer.ts`; the Python trainer writes its format                                                                                      |
| Forward pass, trace, sampling, KV cache, speculative decoding, quantization             | `packages/llm/src/`                                                                                                                                        |
| Production arithmetic and cited hardware/config constants                               | `packages/llm/src/scale/`                                                                                                                                  |
| Seeded randomness                                                                       | `packages/llm/src/rng.ts`, injected everywhere                                                                                                             |
| Model architecture and training                                                         | `training/model.py` with feature flags; each model is a config in `training/configs/`, not a fork                                                          |
| The wall clock                                                                          | `apps/explainer/src/runtime/clock.ts`; a grep test rejects `performance.now`, `Date.now`, `new Date` and `Math.random` elsewhere in `src/` and `packages/` |
| Scene-run inputs (prompt, inputs, transformer lookup)                                   | `apps/explainer/src/runtime/scene-run.ts`                                                                                                                  |
| Inference                                                                               | `runtime/inference.ts` (`createInference`), shared by the worker and the in-process session; lifecycle in `runtime/session.ts`                             |
| Chapter definitions, ladder order, copy, timelines                                      | `apps/explainer/src/chapters/`, validated by `validateChapter()`                                                                                           |
| Look tokens; camera shots                                                               | `apps/explainer/src/look/look.json` (HUD CSS variables and the renderer's `LookConfig` come from it); `look/shots.json`                                    |
| Domain → renderer adapter                                                               | `apps/explainer/src/scene/build-frame.ts` (pure)                                                                                                           |
| Shared builder helpers                                                                  | `scene/builders/parts.ts`, `table.ts`, `scene/ease.ts`, `scene/step.ts`                                                                                    |
| Verification harness, named crops, layer masks                                          | `apps/explainer/scripts/harness.ts` and `verify.ts`, plus `src/lab/probe.ts`                                                                               |

Other rules that must keep holding:

- `bun run verify` is green (format, types, lint, bun tests, training tests). It needs a
  Mac, because the training tests use MPS.
- Every shipped transformer matches torch on its parity fixture
  (`packages/llm/test/trained-parity.test.ts`), and the whole ladder's model files fit
  25 MB (`shipped-models.test.ts`).
- Every chapter passes `validateChapter()`, every chapter has committed media, and each
  lab scene fixture matches what the app computes.
- The browser harness (`bun apps/explainer/scripts/verify.ts`) finds a hardware adapter,
  zero console errors and zero WebGPU validation warnings.
- Budgets on the dev Mac at 1440×900: GPU frame ≤ 8 ms, p95 frame ≤ 16.7 ms, controls
  respond within 100 ms while inference runs, and the `full` model's forward pass takes
  ≤ 50 ms per token. These are implementation budgets, measured by hand on the lab
  pages (`/lab/perf`, `packages/llm/scripts/bench-forward.ts`); no test enforces them,
  and they are never shown as speed.
- Media and cards are recorded locally and committed, because Vercel's builders have no
  WebGPU Chrome. Re-record after any look or loop change
  (`bun run --cwd apps/explainer media`).
- Releasing is a merge into `main`, Vercel's production branch (a project setting, not in
  the repo). Every other branch builds a preview.

## Dead ends

- **A 2,048-token vocabulary.** Only 48.5% of the 2,000 most common words were one
  token, so the per-token pipes and clocks of chapters 4–8 would have drawn word
  fragments. The vocabulary is 4,096 (99.3%).
- **Pipe area proportional to attention weight.** Reviewers couldn't tell 22% from 7%.
  Width is linear in the weight.
- **Pronoun attention in chapter 4.** The one-layer model doesn't learn it (0.58× an even
  spread). Name recall does (2.98×). See the human note.
- **N(0, 1) embedding initialisation.** Tied-embedding models started at a loss of about 30. GPT-2's N(0, 0.02) replaced it. The first `embed` run (3,000 steps) also failed the
  neighbours probe (0.899 against 0.9); 6,000 steps pass.
- **The mean per-prompt drop as chapter 6's metric, and embedding cosine as chapter 7's.**
  Both were replaced after measurement ([choices.md](choices.md), incident 2).
- **`drafter-96`.** It accepts more guesses than `drafter-64` (0.643 against 0.601), but
  its cost leaves a 1.03× speedup against 1.24×.
- **"Once upon a time…" for chapter 8.** Three of layer 0's four heads look at the same
  word, which hides the point that heads differ.
- **Sliding windows of 8, 6 and 5 as chapter 10's demo.** On this prompt, none changes
  the output, so the loop shows 4. They survive as stops on chapter 10's window knob,
  where the scene says so ("here it still writes …").
- **A blue-gradient backdrop.** It became a shared lab room at the human's request.
  Ambient occlusion alone left the room black, so the room's vertex colours also bake
  warm and cool practical light.
- **A counter board shaped like a monitor.** It read as a screen; it is a tally board on
  two posts.
- **A whole-app fallback video.** At phone width it repeated the title as unreadable
  text. The video shows the scene only; the link-preview card shows the whole app.
- **Node bounding boxes for label occlusion.** The two-post stand's box spanned the whole
  board. Meshes are tested per triangle.
- **Expecting `root.destroy()` to free buffers.** It doesn't free buffers the root created
  (measured), despite the TypeGPU 0.12.6 type comment. The resource registry is required.
- **The default Playwright headless shell.** It has no WebGPU adapter. Only
  `channel: 'chrome'` on a secure (localhost) origin gets hardware Metal.

## Visual provenance

- **[assets/reference/](assets/reference/)**: four frames and a 12-frame contact sheet of airsup.ai/rocket-engine
  (from the post's video and page, fetched 2026-09-27). They set the template: a dark
  room, one machine, the control grammar, pinned labels, and the Cutaway and Exploded
  views. The views were compared against `airsup-cutaway-follow.jpg` and
  `airsup-exploded.jpg`, then removed after release (see the amendments). Only the look
  and feel carry over; none of the tech does (D10).
- **[explore/directions.html](explore/directions.html)**: the same attention scene in 4
  looks, 3 levels of literalness, 3 voices and 3 label densities. The human picked the
  Night lab look (D15), a tensor machine that behaves like the analogy (D16), the
  storyteller voice (D17) and key-part labels (D18). It was the colour and mood target
  for the renderer.
- **[explore/game-ui.html](explore/game-ui.html)**: the HUD directions mocked after the
  human asked for "a game UI, not some b2b saas". The human picked holo-tactical, taken
  whole; the shipped HUD departs from it only where legibility forced it: labels are
  sentence case, because the mock's caps overflowed the label box.
- **The approved bloom and room.** The chapter-0 board's bloom and the lab room were
  approved by the human on screenshots, and every later chapter was compared against
  them with the contact sheet (`bun run --cwd apps/explainer sheet`).

## Open follow-ups

- In windows shorter than about 800 px (1280×720) the left column scrolls, and its
  bottom edge fades.
- The brand mark is a placeholder, and there is no favicon.
- The small visual nits listed in [choices.md](choices.md) ("Acceptable, with a known
  cost").

## Sources

- TinyStories: https://arxiv.org/abs/2305.07759, dataset
  https://huggingface.co/datasets/roneneldan/TinyStories (CDLA-Sharing-1.0).
  karpathy/llama2.c showed Llama-architecture TinyStories models and a 4,096-token BPE.
- Llama-3-8B: the published `config.json` (32 layers, 32 query heads, 8 KV heads, hidden
  4096, FFN 14336, vocabulary 128,256).
- H100 SXM: https://www.nvidia.com/en-us/data-center/h100/
- Transformer inference arithmetic: https://kipp.ly/transformer-inference-arithmetic/
- Speculative decoding: Leviathan et al. 2023, https://arxiv.org/abs/2211.17192; Chen et
  al. 2023, https://arxiv.org/abs/2302.01318.
- RoPE: https://arxiv.org/abs/2104.09864 · SwiGLU: https://arxiv.org/abs/2002.05202 ·
  RMSNorm: https://arxiv.org/abs/1910.07467
- Switch Transformer: https://arxiv.org/abs/2101.03961 · Mixtral:
  https://arxiv.org/abs/2401.04088
- Bloom: Jimenez, SIGGRAPH 2014
  (https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/),
  and LearnOpenGL "Physically Based Bloom"
  (https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom).
- TypeGPU 0.12 (https://docs.swmansion.com/TypeGPU/) and pmndrs `math@0.1.0`
  (https://github.com/pmndrs/math) are young: versions are pinned exactly, and code
  written for TypeGPU before 0.12 does not compile.
