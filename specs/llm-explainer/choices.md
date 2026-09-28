# Choices ledger

Decisions made during implementation where the spec was silent, with a verdict.
Per [audit-choices](../../.agents/skills/audit-choices/SKILL.md): each entry is
standalone. Entries are appended per pass and consolidated when the spec closes.

## Slice 01

- **The harness serves the Vite dev server, not a production build.** Why: seconds to
  start versus a full build per run; slice 12 adds `--base <url>` runs against the
  deployed preview, which covers the built output. Verdict: sound, reversible.
- **The dev server binds to 127.0.0.1 on a random free port.** Why: port 5199 was
  already taken by another local project and silently served its page. Loopback
  still counts as a secure context, so WebGPU is exposed. Verdict: sound.
- **`/lab/*` routes come from one `lab/index.html` entry via a small Vite
  middleware, and the lab entry is left out of builds when
  `VERCEL_ENV=production`.** Why: D40 wants lab pages on previews only. Vercel
  rewrites for `/lab/*` land with the deploy in slice 12. Verdict: sound.
- **Both HTML entries carry an empty data-URI favicon.** Why: the browser's
  automatic `/favicon.ico` request produced a 404 console error, which the
  harness (correctly) treats as a failure. Slice 04 can replace it with a real
  icon. Verdict: sound.
- **`packages/llm` passes with no tests until slice 02 adds some (`bun test
--pass-with-no-tests`).** Verdict: sound; remove the flag once tests exist.
- **Python pins: torch 2.14.0, tokenizers 0.23.2, numpy 2.5.3, pytest 9.1.1,
  jsonschema 4.26.0 (latest stable on 2026-09-27).** `bun run verify` now also
  runs `training:test`, whose smoke test fails if Apple's MPS backend is
  unavailable. Verdict: sound, but it makes `verify` Mac-only; revisit if CI is added.

## Slice 03

- **Chapter validation is hand-written, not zod.** Chapter files are TypeScript, so the
  compiler checks shapes; `validateChapter` only checks what types cannot (loop length,
  caption budget, unknown anchors/shots/tokens, stat scales) and returns a problem list.
  Verdict: sound.
- **Each scene declares its anchor ids in `chapters/scenes.ts`, so the validator can check
  anchors before any builder exists.** Verdict: provisional; slice 10 may move the list next
  to the builder so one module owns it.
- **Timelines are cyclic: after the last keyframe the value blends back to the first.**
  Why: the D24 loop must have an invisible seam. Verdict: sound.
- **`shots.json` is seeded with a provisional `bench-close` pose, not left empty.** Why: the
  validator rejects unknown shots, so chapter 0 needs one; the spec said "starts empty".
  Slice 10 owns the real values. Verdict: sound (spec wording was wrong).
- **`look.json` has sections palette (sRGB hex), hud, type, materials.emissive (HDR
  multipliers), bloom (seeded from LearnOpenGL), flow, and empty room/lights for slice 07.**
  `lookConfig()` hands the renderer linear colours with emissive applied. Verdict: sound.
- **`ModelId` is a local union until slice 02 merges, then comes from `@repo/llm`.**
  Verdict: short-lived; the integrator removes it.

## Slice 18

- **Every speed is a roofline ceiling: a step costs max(bytes ÷ bandwidth, FLOPs ÷ dense
  FLOP/s).** FLOPs per token = 2 × matmul params + attention (4 × layers × heads × headDim
  × context). Verdict: sound; matches kipply's inference arithmetic.
- **Two decode numbers: per sequence (`decodeCeilingTokPerSec`) and whole batch
  (`batchThroughput`), both with optional precision `{weightBytes, kvBytes}`.** Why:
  chapter 12 sweeps precision. Verdict: sound.
- **Units are branded types (`Bytes`, `Seconds`, `TokensPerSec`), with compile-time tests
  that they cannot mix.** Verdict: sound.
- **The MoE counterfactual is a named assumption, `llamaAsMoe()`:** attention and
  embeddings shared, each expert a full copy of the MLPs, labelled hypothetical.
  Verdict: sound; chapter 14 copy must say "if Llama were an MoE".
- **Numbers show 3 significant figures with decimal SI bytes ("131 kB", "16.1 GB").** Why:
  it matches the H100 spec sheet's "80 GB"; precise copy can still say 128 KiB.
  Verdict: sound, reversible.
- **A stat-chip format `"s"` (seconds) was added so prefill time can appear on a chip.**
  Verdict: sound.
- **The scale-label prominence shot moved to slice 04,** because the HUD chip doesn't exist
  until then. Verdict: sound.

## Slice 02

- **`loadModel` is async.** Why: browsers only offer sha256 through `crypto.subtle`, which is
  async. Verdict: sound.
- **Counts model size: V = 8192 words × K = 20 successors (1.84 MB).** Why: 99.9% of held-out
  words are in the vocabulary and 71.9% of held-out next words are in the table; bigger
  tables gain little. Verdict: sound, measured.
- **Chapter 0's word splitter is the regex `[a-z]+(?:'[a-z]+)*|[.!?]` after lowercasing.**
  Commas and quotes are dropped. Verdict: provisional. The regex lives only in
  `training/counts.py`; slice 10 must move it into the manifest (one owner) before
  TypeScript splits typed prompts.
- **`p` in `nextWords` is the share among the 20 kept successors, not the true corpus
  share.** Why: the contract requires probabilities that sum to 1. Verdict: sound, but
  chapter 0 copy must say "among the words it kept track of".
- **The word vocabulary is stored as a zero-padded u32 code-point tensor.** Why: it keeps one
  `vocabTensor` within the contract's dtypes. Verdict: sound.
- **Tensors are 64-byte aligned and little-endian.** Verdict: sound.
- **The `q8_0` dtype is deferred to slice 17, which defines its byte layout.** Verdict: sound.
- **Generated JSON (models, schemas, fixtures) is excluded from the formatter.** Why:
  reformatting `tokenizer.json` would change its frozen hash. Verdict: sound.
- **The chapter-0 probe prompt is the single word "upon" (p(a) = 0.999), not "once upon
  a".** Why: the counts model reads one word. Verdict: sound; slice 02's example was wrong.

## Slice 14

- **Orchestrator override: the vocabulary is frozen at 4096, not 2048.** Why: chapters
  4–8 draw per-token pipes and clocks, so tokens must mostly be whole words. At 4096,
  99.3% of the 2000 most common words are one piece; at 2048 it is 48.5%. The slice's
  90% rule was too weak to decide anything, and llama2.c also used 4096. Verdict: sound.
  The rule in slice 14 is rewritten.
- **Byte-level BPE is trained once at 4096 and truncated for the size sweep.** Truncating
  equals training at the smaller size (tested). Verdict: sound.
- **Chapter-1 probes live in a separate `evidence.json` with its own schema.** Why:
  `tokenizer.json` has no manifest, and adding evidence to it would change its frozen hash.
  Verdict: sound.
- **`encode` never turns literal "<bos>"/"<eos>" text into special tokens.** Model code adds
  specials by id. Verdict: sound.
- **`rng.ts` (mulberry32) arrived early, as the single owner of seeded randomness, because
  a property test needed it.** Verdict: sound; slice 15 builds on it.

## Slice 04

- **AppState carries a `loopEpoch` counter.** Why: the reducer stays pure; the frame loop
  restarts the chapter's loop whenever the epoch changes. Verdict: sound.
- **Only scene controls pause the loop** (Follow, slider, scenario, view). The reading aids
  (Analogy/Precise, Precisely, help) only change text. Verdict: sound reading of D32.
- **Arriving at a chapter resets its Follow, slider, scenario, view and Precisely.** The label
  reading and the help state persist across chapters. Verdict: sound.
- **←/→ and the ladder reach written chapters only.** An unknown or unwritten `/#N` loads the
  first written chapter and rewrites the hash in place. Verdict: sound until all 16 exist.
- **Extra keys: Space plays or pauses, ? toggles help, Esc closes it.** Verdict: sound.
- **Model metrics have one owner, `MODEL_METRICS` in `packages/llm/src/metrics.ts`.**
  `validateChapter` rejects a model or probe stat on a chapter with no model. Verdict: sound.
- **`pct` stats show 3 significant figures** ("99.9%", not "100%"). Verdict: sound.
- **TinyStories is credited once, in the help panel, for every chapter.** It is not listed per
  chapter. Verdict: sound, single owner.
- **Fonts are self-hosted: Inter Variable and JetBrains Mono Variable, latin subset only**
  (plus Inter greek, for Σ), from @fontsource-variable 5.3.0 under OFL-1.1. Verdict: sound.
  Human checkpoint: kept the delegated default; shots shown for review.
- **"Follow on X" links to https://x.com/dzhng.** Verdict: user-only. Provisional call:
  keep it until the human names another handle.
- **Share copies the `/#N` link for now.** Slice 12 switches it to the `/c/N/` share route
  (D34). Verdict: short-lived; slice 12 owns the change.
- **The brand slot is a text wordmark "dzhng" with a placeholder two-block mark, and there is
  no favicon.** Verdict: provisional; revisit at release (slice 36).
- **The probe has no `goto`/`setUi`.** The harness drives the UI with real key presses
  (`--press`) instead. Verdict: sound; slice 10's probe list is superseded.
- **The HUD created `/lab/tokens` (chips section).** Slice 08 adds its emissive section
  there. Verdict: sound; the ordering in the spec was wrong.

## Slice 15

- **Attention sums its keys in a fixed order (highest score first).** Why: D35's "shuffling
  earlier words changes nothing" must hold bit for bit, and floating-point addition depends
  on order. Verdict: sound.
- **The trace is split into attn (with its own residual record), mlp, router and
  mlpResidual.** Why: each layer has two residual additions, so one flat record per layer
  would blur them. Verdict: sound.
- **Every prompt starts with the `<bos>` token (`promptTokens`).** Verdict: sound.
- **Manifests require a matching tokenizer and an arch for transformers, and the arch adds
  `normEps`.** Verdict: sound.
- **The 9 random-init parity fixtures cost 2.6 MB,** because every token table must span the
  full 4096 vocabulary. Verdict: acceptable; revisit if repo size matters.
- **Plain JS loops for the forward pass.** The `full` size measured 2.9 ms per prompt token
  and 3.9 ms per cached token, far under the 50 ms budget. Verdict: sound.

## Slice 16

- **Embeddings start from N(0, 0.02), GPT-2's init; the random-init fixtures were
  regenerated.** Why: N(0, 1) with tied embeddings starts at a loss of about 30.
  Verdict: sound.
- **The chapter-4 probe added a name-recall prompt set after the pronoun set failed.** Both
  are recorded; chapter 4 uses the passing set, and the README human note explains it.
  Verdict: sound per D33, but post hoc. The human should know it was not planned up front.
- **MPS training is not bit-deterministic across processes, so the MPS test checks
  agreement within 1e-5.** CPU runs are bit-identical. Verdict: sound.
- **The trained-model parity fixtures keep every 16th logit plus the top 8** (about 100 KB
  each). Verdict: sound.
- **The lab middleware no longer serves the main app for `/lab` URLs whose query has a
  "."** (a harness bug). Verdict: sound fix.
- **`runtime/models.ts` now delegates to `@repo/llm` `fetchModel`, which resolves the
  tokenizer path against the manifest's directory.** Why: slice 04 had duplicated it with the
  wrong base. Verdict: sound.
- **`bun run verify` now takes about 2 minutes, because the training tests train on MPS.**
  Verdict: acceptable for now; a later maintenance pass may split slow training tests into
  their own script.

## Slices 05–09 (renderer lane)

- **Shaders are WGSL templates resolved by `tgpu.resolve`, so structs come from the TypeGPU
  schemas. Pipelines are raw WebGPU with every bind-group index pinned.** Why: frame encoding
  stays allocation-free. This departs from the skill's "pin only group 0", which assumes
  TypeGPU-managed pipelines. Verdict: sound, but the renderer skill's wording should mention
  this case.
- **Group 0 carries both the frame uniform and the look uniform.** Verdict: sound.
- **`Renderer.setLook()` swaps a new look in without recreating the renderer.** It is the
  "pipeline rebuild" in the registry-baseline test. Verdict: sound.
- **`LookConfig` carries linear numbers only; token → linear conversion lives in the app's
  `look.ts`.** Verdict: sound, single owner.
- **Every part has a `transform: Mat4`, blocks included; `partWorld` returns it unchanged
  until slice 13.** Verdict: sound.
- **Mesh materials bind to presets by the last dotted node-name segment, then fall back to
  the glTF material name.** Blender materials are named after the presets. Verdict: sound.
- **Props export without UVs, so builds are byte-reproducible.** Verdict: sound; revisit if
  a prop ever needs a texture.
- **The counter board became a tally board on two posts; the first design read as a
  monitor.** Verdict: sound.
- **The room is world geometry with depth read-only, outside the prepass.** Verdict: sound.
- **Specular reflects the room gradient analytically, and lights have an apparent size.**
  Why: metal and glass didn't read with direct lighting alone. This is a lightweight stand-in
  for image-based lighting, which the slice's default had left out. Verdict: sound; the human
  approved the resulting look.
- **Glass has no diffuse term; its absorption rises with Fresnel toward grazing angles.**
  Verdict: sound.
- **Added an AgX saturation knob (1.25) so glows keep their colour.** Verdict: sound.
- **GPU timing is opt-in (`createRenderer(…, { timing: true })`) and reports
  `receipt.gpuMs`.** Verdict: sound.
- **The bloom chain starts at half resolution with 5 mips.** Measured cost: 0.46 ms at
  1440×900. Verdict: sound.
- **Translucent parts never occlude labels, and mesh occlusion is tested per triangle.**
  Why: node bounding boxes are too coarse (the two-post stand spans the whole board).
  Verdict: sound.
- **Label overlap is resolved by pill-vs-pill and pill-vs-dot tests using measured pill
  widths; lab pills are 150 px wide at most.** Verdict: sound.
- **`placeLabels` takes no viewport (the camera matrices carry it), `sceneOccluders` takes the
  look, and `hiddenBy` gains `'overlap'`.** Verdict: sound; small contract deltas from the
  slice text.
- **Research: `root.destroy()` does NOT free buffers the root created** (measured with a
  control buffer). This confirms the renderer skill; the registry is required.

## Slice 10

- **Part transforms are per-frame data.** The renderer repacks instances every frame
  (allocation-free), and `revision` only signals a change in structure. Verdict: sound.
- **Labels take the first side (up-right, up-left, down-right, down-left) that avoids other
  labels, scene text and the screen edge.** Verdict: sound.
- **Bar words and the card word are "scene text", a separate overlay using the same
  placement code.** They are not labels, so D18's five-label cap still holds. Verdict: sound.
- **Chapter 0's loop words live in chapter data as `loop.inputs` (once, upon, onse); typed
  text or a scenario replaces them.** Verdict: sound.
- **The word-splitting regex lives in the counts manifest (`tokenizer.pattern`/`replace`),
  pinned by a Python/TS fixture.** Verdict: sound; this closes the slice-02 provisional entry.
- **No synchronous inference seam was ever built:** chapter 0 used slice 15's worker from
  the start. Verdict: sound; the README's short-lived seam is removed.
- **`buildFrame` returns `SceneFrame` (frame input plus scene-text tags).** Verdict: sound;
  a small deviation from the slice's signature.
- **Occluders are rebuilt only on a revision or view change, not when parts move.** Moving
  bars can therefore be slightly stale as occluders. Verdict: acceptable, because labels
  anchor to static parts; revisit if a chapter labels a moving part.
- **The prompt box sits inside the title panel.** Verdict: sound (delegated).

## Slice 11

- **Chapter 0's loop runs 20 s and shows the rule twice (once → upon → a), then the failure
  ("onse": never seen, no bars).** A test checks that each input is the previous one's top
  successor and that "onse" is not in the vocabulary. Verdict: sound.
- **A `barsWord` channel lets the bars lag the card.** Verdict: sound.
- **A "never seen" scene note makes the failure beat readable.** Verdict: sound.
- **Lower-ranked scene tags hide when they collide with higher-ranked ones, and labels also
  avoid the HUD panel rects (measured on render and resize).** Verdict: sound.
- **Shares never round to a false 0% or 100%: they show "<1%" or ">99%".** Verdict: sound.
- **The third stat is "“a” after “upon”" (the top-successor probe), not a generic "chance of
  the top next word".** Verdict: sound; it is more concrete.
- **Human checkpoint (copy read): accepted by the lane after three unprimed critique rounds,**
  which fixed an off-camera hand-off, a 6 s static hold, a card bounce at the seam, and a
  label sliding behind the title panel.

## Slice 17

- **`moe` is 4.6 MB, over slice 16's 4 MB per-model cap.** The cap is read as applying only to
  slice 16's models, since slice 17 names only the 25 MB ladder total. Measured total:
  22.98 MB, enforced by a test. Verdict: sound.
- **Slice 17 models use tied embeddings (apart from `mlp`) to fit the budget.** Verdict:
  sound.
- **The drafter's acceptance rate is Leviathan's β averaged over teacher-forced validation
  positions; its cost is the ratio of parameter counts.** Results: drafter-64 α 0.595
  (expected speedup 1.23), drafter-96 α 0.638 (speedup 1.03). O3 is provisionally
  drafter-64; slice 33 finalises it. Verdict: sound.
- **Two probe metrics were changed after their first measurement.** Both first values are
  recorded in slice 17's file. Verdict: sound, but post hoc, so the human should know.
  - `mlp`: the mean per-prompt relative drop (0.12) was replaced by the drop in total
    correct-answer probability (94.9% with the top 16 neurons off). Why: prompts where the
    model assigns the answer about 0.001 dominated the mean.
  - `residual`: an embedding-cosine metric was replaced by the residual-norm trace the
    contract names (21.5 vs exactly 0 for `noresidual`).
- **`q8_0` is an f16 scale plus 32 int8 values per group.** TypeScript dequantization matches
  Python bit for bit. Verdict: sound.
- **Every probe measures the exported f16 weights; the D35 probe runs on the shipped
  TypeScript runtime.** Verdict: sound; the probes measure what ships.
- **`noresidual` never learns (val loss 8.3 = ln 4096).** That is chapter 7's visible
  failure, as intended. Verdict: sound.

## Slice 11b

- **The environment's vertex colours carry more than AO:** R = ambient occlusion, G/B = baked
  warm and cool practical light, tinted by `look.room.practicals.*.spill`. Why: AO alone left
  the room black, because the renderer has no local lights. Verdict: sound; the slice's
  `COLOR_0` seam was widened.
- **`SceneDesc.environment` is drawn in its own slot, never in `scene.parts`,** so the room
  never occludes labels or gets a crop. Verdict: sound.
- **Direct lights fall off outside `look.lights.pool`, and `OrbitLimits.bounds` keeps the
  camera inside the room.** Verdict: sound.
- **The floor light pool reads as a stage spotlight; this is kept deliberately.** Verdict:
  provisional; the human asked for a richer room (11c).

## Slice 13

- **A mesh prop can be split per node, with explode and clip set per node.** Verdict: sound.
- **Cutaway is a fragment-stage plane from `look.views.cutaway.planes`.** Back faces seen
  through the cut are capped in a flat cap colour. Discard/no-cull pipeline variants run only
  while cutting. Verdict: sound; the flat, bright cap is a known polish item.
- **View changes ease in over 0.6 s.** Verdict: sound.
- **The counter board's bezel and ticks are lifted 2 mm off the panel face,** because coplanar
  faces z-fought in the cut. Verdict: sound.
- **From the hero angle, Exploded reads mostly as a depth shift.** Verdict: accepted for
  chapter 0; later chapters with more parts should explode sideways.

## Slice 04b

- **Direction: holo-tactical, taken whole (the human's pick).** Verdict: sound.
- **The HUD cyan is a HUD-only `hud.accent`, not the palette's `active`,** so restyling the
  HUD can never change the scene. Verdict: sound.
- **Body copy stays in Inter.** Chakra Petch (caps) is for headings, controls, chips and
  labels only, for legibility. Verdict: sound.
- **Labels are sentence case, not the mock's caps,** because caps overflow the renderer's
  220 px label box. Verdict: sound.
- **The help panel's plate is opaque.** Verdict: sound.
- **Stat chips count up over 400 ms and then show the exact settled text; a held clock or
  reduced motion skips it.** Verdict: sound; tested.
- **Panels slide in over 360 ms on arrival via `useArrivalIntro`, keyed on `loopEpoch`.**
  11c may key it to the camera-move start. Verdict: sound.
- **Only Chakra Petch weights 600 and 700 ship.** Verdict: sound.
- **The brand mark is not redrawn;** brand art is deferred to slice 36. Verdict: sound.

## Slice 11c

- **The contact shadow is a `shadow` part kind with a soft footprint.** Materials gain a
  `specular` knob, and the shadow's is 0, so it only darkens. Verdict: sound; it is one blob,
  not per-foot contact (polish item).
- **The arrival move is a smoothstep from `room-wide` to the hero pose over 2.5 s
  (`runtime/arrival.ts`).** The loop clock is paused until landing. Verdict: sound, per D42.
- **Known polish items, accepted for now:** the shelf props are plain boxes, the floor light
  pool reads as a stage spotlight, and the "once" card's label hides for about 1 s mid-move.
  Verdict: provisional; revisit at the whole-spec review.

## Slice 12

- **Incident: the first `vercel deploy` went to production** (a new project with no git
  connection defaults to the production target). It was aliased to `aiexplainer-red.vercel.app`
  and removed within minutes; the alias returns 404 now, and every later deploy uses
  `--target=preview`. The production domain may have been publicly reachable for those minutes.
  Verdict: mistake, remediated. The rule is always `vercel deploy --yes --target=preview`.
- **Previews are behind Vercel Authentication (Standard Protection).** One automation-bypass
  secret (note "harness") exists for the harness; it is not in the repo. Verdict: sound.
- **The fallback video shows the scene only (HUD hidden but laid out), cropped to the safe
  rect.** The link-preview card is the whole app, HUD included. Why: at phone width the full-app
  video repeated the title as unreadable text. Verdict: sound.
- **The recorder uses a new `?clock=step` plus `probe.step()`.** `clockIsHeld` became
  `clockIsDriven` (held or step), so HUD motion and the arrival move are skipped while
  recording. Verdict: sound; a looping video must not open with a one-off camera move.
- **Media is committed under `public/media/`, not generated on Vercel,** because Vercel's
  builders have no WebGPU Chrome. Re-run `bun run --cwd apps/explainer media` after any look or
  loop change; a test fails when a written chapter has no media. Verdict: sound.
- **Video: H.264 at the best CRF between 18 and 33 that fits 3 MB, poster = first frame.**
  Chapter 0 is 548 KB, and repeat recordings are byte-identical. Verdict: sound.
- **Share pages redirect with both a meta refresh and `location.replace`. The `og:image`
  origin is `SITE_URL`, else `https://$VERCEL_URL`.** Verdict: sound; slice 36 sets `SITE_URL`
  once O5 is picked.
- **`detectSupport(env)` takes an environment so it is testable; small-screen is < 900 px or a
  coarse-only pointer.** Verdict: sound.
- **The device line differs by reason** ("send yourself the link" vs "needs WebGPU: try
  desktop Chrome or Edge"). Verdict: sound.
- **The Vercel project was created via the CLI plus the REST API**, because the CLI has no
  root-directory flag. Verdict: sound.

## Slice 19 (chapter 1)

- **The tokenizer is a chapter "model" (`model: "tokenizer"`, a `LoadedTokenizer` as a
  `ModelSource`),** so stats, the HUD text box and the run treat it like any model.
  Verdict: sound.
- **`computeRun` takes `{ model, session }` and switches on the scene.** Verdict: sound.
- **Brick colour encodes merge order:** pale = a single byte, yellow = id < 1024, coral =
  later merges. A test proves ids follow merge order. Verdict: sound.
- **`SceneDesc.layout` was added: a builder bumps it, and the stage re-tests label occlusion.**
  Why: moving parts left stale occluders (the slice-10 caveat). Verdict: sound; it closes that
  provisional entry.
- **Identical tubes share one geometry (a content-keyed cache), so brick studs instance.**
  Verdict: sound.
- **The app hands the HUD only the model that matches the current chapter.** Why: a page error
  on ←/→ otherwise. Verdict: sound fix.
- **A new `ARITH.vocab` entry supplies Llama-3-8B's 128,256.** Verdict: sound.

## GitHub and Vercel Git link (human request, 2026-09-27)

- **Public repo `github.com/dzhng/aiexplainer`; the working branch `llm-explainer` is the GitHub
  default branch.** The human asked for a public repo linked to the Vercel project. Verdict:
  sound. Note: the 5 airsup reference frames in `specs/llm-explainer/assets/reference/` are
  public with it (small design references, credited to their source); remove them if unwanted.
- **Vercel's production branch is `main`, created at the bootstrap commit, which has no app, so
  its builds fail and nothing ships.** Every push to `llm-explainer` (and other branches) builds
  a protected preview. Releasing to production is the deliberate act of merging into `main`,
  which is the human's call (O5, slice 36). Why: linking defaulted production to
  `llm-explainer`, which would have made every push a production deploy. Verdict: sound.

## Slice 20 (chapter 2)

- **The PCA display projection is fitted to the 60 pinned rows, not all 4,096.** Measured: it
  keeps pairs tighter (pair/mean distance 0.30 vs 0.37). The help panel discloses it via a new
  `ChapterDef.help.notes`. Verdict: sound; honest, because it is disclosed.
- **The pinned words are the 30 probe pairs whose partners are nearest by the probe's own cosine
  measure.** Verdict: acceptable, but these are the best-case pairs; the chip (96.7% partner
  nearer than a random word) states the average honestly.
- **Height is the third PCA direction, and arrows start at the zero vector's projection.**
  Verdict: sound.
- **Typed words are looked up with a leading space (as mid-sentence), up to 8.** Verdict: sound.
- **The table is a shared `builders/table.ts` for chapters 1–3.** Verdict: sound.
- **The noun cluster overlaps its word tags at the hero angle, because those are the real
  positions.** Verdict: polish item for the whole-spec review.

## Slices 26–28 (chapters 6–8)

- **Every chapter run is one file, `runtime/runs/<scene>.ts`, dispatched by `computeRun`.**
  Verdict: sound; one owner per scene.
- **One in-process inference core, `createInference`, is shared by the worker and
  `localSession`.** `direct-session.ts`, which duplicated it, is deleted. Verdict: sound.
- **`session.run(tokens, {trace, window, model, mlpOff})` takes an options object, and the
  worker keeps every model it has loaded, keyed by id.** Verdict: sound; other lanes adapt on merge.
- **Tube occluders ignore stretch along the path.** Why: a stretched unit tube occluded the whole
  scene. Verdict: sound fix.
- **A new stat format `nats` shows chapter 7's two val-loss chips,** backed by new
  `val-loss-residual`/`val-loss-noresidual` evidence written by re-probing (`--probe-only`).
  Verdict: sound.
- **Chapter 8's prompt is "One day, a little bird was looking for"**, because on "Once upon a
  time…" three of layer 0's four heads peak on the same word, which hides "readers look for
  different things". Verdict: acceptable; picked for the effect, but it is a real model
  output (D25).
- **D5's zoom-out is `ChapterDef.pullBack {shot, channel}`, blended with `arrivalPose`.**
  Verdict: sound; it reuses the one camera-tween owner.
- **Chapter 8's head pipes are interim tube segments until lane B's `pipes` primitive lands.**
  Verdict: short-lived seam; removed when slice 22's primitive merges.
- **Polish items for review:** chapter 8's three-line title and a stray tube at the left edge
  of the hero frame.

## Slices 31–32 (chapters 11–12)

- **Chapter 11 shows the ridge beat as the knee at batch 329 (new `ARITH.computeBoundBatch`,
  where a step's arithmetic time equals its memory time), not the raw ridge figure of about
  295 FLOP/byte.** Why: that is the batch where the seats fill. Verdict: sound, and the
  arithmetic is exact.
- **Stat chips take `ArithArg` bindings (`{slider: true}` or `{probe}`),** so chips follow the
  slider or feed a probe into a formula without typing a number. Verdict: sound, and it
  strengthens D25.
- **`SliderDef.loop` plus `AppState.sliderSet`: the loop plays the slider until the reader moves
  it,** and the HUD samples the channel at 10 Hz. Verdict: sound; it is compatible with D32
  (a reader's input takes over).
- **Chapter 11's prefill is a loop beat, not a HUD scenario,** because a model-less chapter has
  no probe for a scenario to cite. Verdict: sound.
- **Chapter 11 has no Cutaway view (the bus sides are windows).** Verdict: sound.
- **Chapter 12's fp16/int8 toggle is the slider, and the HUD scenarios are `full-q8`'s two
  KL-chosen prompts.** Verdict: sound.
- **A `weights` request (Inference, Session, worker, local) serves raw tensor slices for the
  weight strip.** Verdict: sound; one path through `weightSlice`.
- **Copy violation found at merge:** the chapter-12 chip label "KL divergence (nats)" is jargon
  (D2). Sent back for a plain relabel. Verdict: fix pending in lane D.

## Slice 21 (chapter 3)

- **The die is a barrel whose faces are the top six words plus "every other word", each face
  exactly as wide around the rim as its probability at the current temperature.** The stop
  angle comes from the seeded generator, so the landed face equals `sample()` (tested).
  Verdict: sound.
- **The loop's temperature channel drives the die until the reader moves the slider; the HUD
  slider itself doesn't move during the demo, and a scene note shows the live temperature.**
  Verdict: acceptable; lane D's later `SliderDef.loop` pattern could unify this in review.
- **The chapter-3 fixture run is 353 kB, because it stores the full logits the honesty test
  needs.** Verdict: acceptable.
- **The failure beat: two stories ending in "it" roll the identical die** (the model sees only
  one word). Verdict: sound.

## Slice 29 (chapter 9)

- **The work counter adds each step's real `fed` token count (+10, +11, …),** and the failure
  beat spells out the sum; the Llama chips use new arith `rereadTokens` (32,896 tokens reread
  to write 256) and `maxContext`. Verdict: sound, and it counts operations, not time (D27).
- **The slider is "Words to write" (1–6).** Verdict: sound.
- **Chapter 9's line helpers (`LINE`, `buildLine`, `placeFeed`, `placeTile`) are exported from
  `builders/generation.ts` for chapter 10 to reuse.** Verdict: sound; one owner for the text
  line.

## Slices 22–24 (chapter 4)

- **Pipe width is linear in the attention weight (not area-proportional).** Why: with area
  proportional to weight, an unprimed reviewer couldn't tell 22% from 7%. Verdict: sound; the
  CPU-mirror test pins radius × widthScale to the weights.
- **Tubes carry a per-vertex axis (Vertex is now 48 bytes, plus `along` for flow pulses), and
  the GPU scales the radius by `widthScale`.** Verdict: sound.
- **The focus word's self-pipe is kept, so the widths sum to 1.** `<bos>` shows as "start".
  Verdict: sound.
- **The sealed future words are the model's own greedy continuation, traced from the focus
  position; their weights are exactly 0.** Verdict: sound.
- **Flow pulse brightness scales with each pipe's weight relative to the widest, and the look
  token `flow.cyclesPerSec` is 1.4.** Verdict: sound.
- **A needle on the mix shows the real angle change of the focus word's vector toward "Mia"
  (90.1° → 74.2°).** Verdict: sound, and a real value.
- **The failure beat uses the attn order-probe pair: the cat↔dog swap gives bit-identical
  logits ("cat", 35%).** Verdict: sound (D35).
- **Chapter 8's head pipes moved onto the pipes kit; the interim tube seam is removed.**
  Verdict: sound.

## Slices 33–34 (chapters 13–14)

- **O3 is final: drafter-64** (held-out α 0.601, speedup 1.24×; drafter-96 α 0.643, 1.03×), on
  40 held-out stories disjoint from selection. Verdict: sound.
- **Chapter 13's slider is k (1–8); the run holds seeded rounds for every k.** The loop uses
  seed 11 of 1–12, picked so the three rounds show a bonus, a correction and an early reject.
  The chips show the held-out averages, not this run. Verdict: acceptable; the choice of seed
  is disclosed in the slice file.
- **The senior's correction takes the first rejected slot, and rejected tiles drop out of the
  row.** Verdict: sound.
- **Chapter 14's router choices are real, from layer 1 of 4, and its histogram comes from new
  `expert-usage-<e>` evidence.** The Llama chip uses `moeActiveParams` under the named
  hypothetical `llamaAsMoe` (13.7 billion per word). No specialisation claims. Verdict: sound.
- **Cutaway is omitted in chapters 11–14; a section adds nothing there.** Verdict: sound.
- **Polish nits left:** chapter 14's queue reads right to left, some sweep azimuths are blocked
  by room geometry, and a ceiling rafter crosses the HUD kicker (house-wide).

## Slice 25 (chapter 5)

- **Clock hands turn by position × pair 5's real RoPE angle (about 22° a word), not the slowest
  pair.** Why: pair 5 needs no visibility scaling, so there is nothing to disclose. Verdict:
  sound; it amends the slice's default.
- **The shown difference between orders (7.45%) equals the probe value to 1e-12; the guess
  differs ("dog" 32% vs "cat" 30%).** Verdict: sound.
- **Polish items:** in chapter 4, front-row pipes cross back-row words and pipes regrow rather
  than move during the swap. In chapter 5, the pair angle is written but not drawn, the last
  dial washes out, and the hands unwind at the loop seam. Verdict: backlog.

## Slice 30 (chapter 10)

- **`packages/llm/src/kvcache.ts` owns the KV cache (moved out of `forward.ts`); a cache
  smaller than the context is a ring that evicts old positions.** Tests: cached equals
  uncached, and the ring equals a windowed reference. Verdict: sound.
- **The sliding window shown is 4, because at 8, 6 and 5 this prompt's words don't change.**
  With 4, the model writes "girl named Lily." instead of "boy named Tim.", and the caption says
  this is not how Llama-3-8B runs. Verdict: sound, and honest.
- **The memory chips use a new `kvBytesPerToken` metric (2.05 kB, this tiny model) against
  arith (131 kB, Llama-3-8B).** Verdict: sound.
- **GQA is shown as unshared notes that are then dropped.** Verdict: sound; it is the real
  2-for-4 sharing.
- **Polish items:** chapter 8's violet-plus-blue bloom runs hot, long words overhang their tiles
  in chapters 9–10, chapter 7's river reads as a glass duct, and labels at back angles can point
  at hidden parts. Verdict: backlog.

## Slice 35 (chapter 15)

- **The finished machine owns no chapter parts:** each station is its own chapter's builder and
  run, copied into one scene (slug-prefixed, slot-offset, scaled) on a 5-wide serpentine
  grid. Its only part is a flowing floor route in tour order. A test pins "union of stations,
  nothing twice". Verdict: sound, one owner per part.
- **The tour follows a word's path:** board, then bricks → pins → pipes → clocks → panel → bays
  → river → assembly line → die → rail → notes, then the serving tricks (junior, crates, bus).
  1.6 s per stop, a 29.6 s loop, and each stop reuses its chapter's hero shot, scaled.
  Verdict: sound; the busiest stops show more text than 1.6 s allows (accepted, since the loop is
  at the cap).
- **The D18 label cap of 5 is waived for a toured chapter, because only one station's label
  shows at a time.** Verdict: sound.
- **The stage's `update` can steer the camera, and orbiting hands it back to the reader;
  `RunContext.source` loads another chapter's model once.** Verdict: sound.
- **Bug fixed: the app only loaded the first chapter's props** (the board and bus never drew
  when arriving from another chapter). Verdict: sound fix.
- **D21 audit: 16 loops = 388.6 s, plus 16 arrival moves = 428.6 s (7 min 9 s), within the
  10-minute skim.** Verdict: sound.
- **Chips: 1.51 million weights (the `full` model) vs 8.03 billion (Llama-3-8B), and Llama's 32
  blocks; no scenarios (no single probe to cite).** Verdict: sound.

## Release setup (human decisions, 2026-09-27)

- **No custom domain: production is `https://aiexplainer-red.vercel.app`.** `SITE_URL` is set
  for the production target on Vercel, so `/c/N/` link-preview cards use the stable domain.
  The human disabled Vercel Authentication, so previews are public too. Verdict: the human's
  call; O5 is closed.

## Polish pass

- **The HUD's top-left corner stays clear of busy room geometry,** chosen over keeping the left
  strip light and conduit. Trade-off: the left back wall reads plainer. Verdict: sound.
- **The floor pool is a long soft falloff stretched 1.6× along the ceiling tubes
  (`lights.pool.stretch`).** Verdict: sound; no more stage-spotlight disc.
- **Contact shadows are per foot (`contactShadow` feet, `blockFootprint`)** for subjects on
  legs. Solid-bodied subjects keep one blob. Verdict: sound.
- **Scene-text bug fixed:** a style reset wiped every scene word's dark halo in all chapters.
  The text is now pinned at the 1rem it always rendered at, not the `--text-sm` token the code
  named. Verdict: sound; the approved look only gains the halo.
- **Chapter 3's HUD slider now plays the loop's temperature (the `SliderDef.loop` pattern), and
  `snapSlider` drops float residue.** Verdict: sound; it closes the slice-21 provisional entry.
- **Chapter 8's title is "Many readers, one assembly line".** Its bloom was measured
  (0.52–0.58% near-white vs about 1.05% elsewhere) and accepted as dense, not hot. Verdict:
  sound.
- **Chapter 7's river gets flowing currents (the kit's `flows`); chapter 5's hands shrink with
  their words at the seam instead of unwinding; chapter 14's queue reads left to right; the
  rail tiles in chapters 9–10 widen to 0.34 m.** Verdict: sound.
- **Accepted:** chapter 4's thin low-weight pipes cross back-row words at the hero angle,
  because of the projection. Verdict: sound, the reason is recorded.
- **Left for the release check:** chapter 10's scene note sits under the controls panel, a
  lavender input bar floats beside chapter 8's left HUD, and chapter 3's ":" and "," words are
  tiny.
