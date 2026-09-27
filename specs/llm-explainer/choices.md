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
