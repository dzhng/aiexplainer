# How LLMs work, from first principles

An interactive 3D explainer for software engineers with no ML background. It
starts from the simplest thing that can predict text (word-pair counts) and adds
one part per chapter until it reaches a production LLM. Every part is drawn as a
real tensor machine that _behaves like_ an everyday analogy (water pipes, dice,
clock hands, a bus), and is backed by a real tiny model trained for that chapter.
The style reference is airsup.ai/rocket-engine
([reference frames](assets/reference/)).

Settled ground lives in the explore map,
[explore/map.html](explore/map.html): decisions D1–D30 and L1, with their reasons.
This README adds the decisions made while slicing (D31–D41), owns the build ladder,
and supersedes the map's open-items list, kickoff prompt and tweakable plan.

## Next Agent Prompt

**Status (2026-09-27):** slice 01 is done. The workspaces, the uv training
project, the clock, and the real-GPU harness (`bun apps/explainer/scripts/verify.ts
--route <path>`) exist. The harness passes on hardware Metal and fails on the
headless shell (negative control).

**Next pickup:** these can run in parallel:

- [02 manifest + counts model](slices/02-manifest-and-counts-model.md), then 03 → 04 (data and HUD lane);
- [05 renderer foundation](slices/05-renderer-foundation.md), then 06 → 09 (renderer lane).

You are implementing this spec with [implement-spec](../../.agents/skills/implement-spec/SKILL.md).
Work the slices in the order of the ladder below. Each slice file is a contract:

- Build only what it names.
- Run every verification step it lists. Every visual shot ends with
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md), and
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md) runs
  whenever the slice names a target.
- Record any decision the slice did not delegate in [choices.md](choices.md).

Before you start any GPU slice, read [the renderer skill](../../.agents/skills/renderer/SKILL.md).
Before you write any on-screen copy, read [Copy rules](#copy-rules).

When the work reveals the plan is wrong, reslice here first, then continue.

**Warnings:**

- `typegpu@0.12.6` and `math@0.1.0` are young. Pin exact versions.
- Code or snippets written for TypeGPU before 0.12 will not compile. The APIs
  `withVertex`, `.value` and `layout.bound` were removed.
- Headless WebGPU only works with Playwright `channel: 'chrome'` on `http://localhost`.
  The default headless shell has no adapter.
- **`root.destroy()` is contested.** The renderer skill says it does not free what the root created. The 0.12.6 d.ts comment says it does. Keep the registry regardless, and let slice 05's baseline test establish the truth.

**Before ending your pass, update this section:** status, date, the next pickup,
the checklist below, and any new blockers.

### Global checklist

- [ ] M1 — Chapter 0 through every layer (D14): slices ✅[01](slices/01-scaffold-harness.md) · [02](slices/02-manifest-and-counts-model.md) · [03](slices/03-chapter-contract.md) · [04](slices/04-hud-shell.md) · [05](slices/05-renderer-foundation.md) · [06](slices/06-gltf-pipeline.md) · [07](slices/07-room-lighting.md) · [08](slices/08-bloom.md) · [09](slices/09-labels-occlusion.md) · [10](slices/10-ch0-compose-framing.md) · [11](slices/11-ch0-loop-pacing.md) · [12](slices/12-fallback-share-deploy.md)
- [ ] M2 — Vocabulary lock: [13](slices/13-vocabulary-lock.md)
- [ ] M3 — Model lab: [14](slices/14-tokenizer.md) · [15](slices/15-transformer-core.md) · [16](slices/16-model-lab-early.md) · [17](slices/17-model-lab-late.md) · [18](slices/18-production-arithmetic.md)
- [ ] M4 — Chapters: [19](slices/19-ch-tokenizer.md) · [20](slices/20-ch-embeddings.md) · [21](slices/21-ch-sampling.md) · [22](slices/22-ch-attention-width.md) · [23](slices/23-ch-attention-sealed.md) · [24](slices/24-ch-attention-flow.md) · [25](slices/25-ch-positions.md) · [26](slices/26-ch-mlp.md) · [27](slices/27-ch-residual.md) · [28](slices/28-ch-stack.md) · [29](slices/29-ch-generation.md) · [30](slices/30-ch-kv-cache.md) · [31](slices/31-ch-batching.md) · [32](slices/32-ch-quantization.md) · [33](slices/33-ch-speculative.md) · [34](slices/34-ch-experts.md) · [35](slices/35-ch-finished.md)
- [ ] M5 — Release candidate: [36](slices/36-release.md)

## Goal and non-goals

**Goal:** a 16-chapter ladder that a software engineer can skim in about 10
minutes. It ships as a static site on Vercel, is posted on X, and is branded dzhng.

**Non-goals:**

- The training chapter (D8).
- 3D on phones, and a WebGL fallback: small screens and browsers without WebGPU get
  the video fallback (D20, D29).
- Running a real production model in the browser.
- A server of any kind.
- Localisation.
- Backward compatibility or migrations. The project is greenfield: hard cutovers,
  no shims.

## Chapters

Chapter ids are slugs. The display number is the chapter's index in the ladder
(D31). The "Map #" column is the numbering used in the explore map; it is used
there only.

| Display | Slug           | Adds                          | Model (id)                     | Slice(s)   |
| ------- | -------------- | ----------------------------- | ------------------------------ | ---------- |
| 0       | `autocomplete` | Word-pair counts              | `counts`                       | 02, 10, 11 |
| 1       | `tokenizer`    | Tokenizer                     | shared tokenizer               | 14, 19     |
| 2       | `embeddings`   | Embeddings                    | `embed` (the input half)       | 16, 20     |
| 3       | `sampling`     | Output + sampling             | `embed`                        | 16, 21     |
| 4       | `attention`    | Attention                     | `attn` (1 layer, no positions) | 16, 22–24  |
| 5       | `positions`    | RoPE                          | `rope` (1 layer)               | 16, 25     |
| 6       | `mlp`          | MLP                           | `mlp`                          | 17, 26     |
| 7       | `residual`     | Residual + RMSNorm            | `residual`                     | 17, 27     |
| 8       | `stack`        | Heads + layers                | `full` (GQA)                   | 17, 28     |
| 9       | `generation`   | The generation loop           | `full`                         | 29         |
| 10      | `kv-cache`     | KV cache, GQA, sliding window | `full` + Llama arithmetic      | 30         |
| 11      | `batching`     | Prefill vs decode, batching   | arithmetic                     | 31         |
| 12      | `quantization` | Quantization                  | `full-q8`                      | 17, 32     |
| 13      | `speculative`  | Speculative decoding          | `drafter` + `full`             | 17, 33     |
| 14      | `experts`      | Mixture of experts            | `moe`                          | 17, 34     |
| 15      | `finished`     | The finished machine          | all                            | 35         |

Map numbers for the chapters, in the order above: 0–8, then 10–16.

Analogies are in the map's ladder table and are binding. The copy rules below
qualify the precise claims.

## Build ladder

```
M1  01 → 02 → 03 → 04        (data, contract, HUD on a stub canvas)
         01 → 05 → 06 → 07 → 08 → 09   (renderer, one visual variable each)
    04 + 09 → 10 → 11 → 12   (ch0 compose, pacing, fallback + deploy)
M2  12 → 13                  (vocabulary lock: kit, tokens, views)
M3  02 → 14 → 15 → 16 → 17   (model lab: every model trained and probed before any chapter art)
    03 → 18                  (production arithmetic; independent)
M4  13 + 16 → 19 … 25        (chapters 1–5)
    13 + 17 → 26 … 28        (chapters 6–8)
    28 → 29 → 30 (+18) → 31 (+18) → 32 → 33 → 34 → 35
M5  35 → 36
```

Slices in different lines can run in parallel once their inputs are green. The
ladder dies fast in three places:

- **Slice 05–08:** if TypeGPU plus hand-built bloom cannot reach the Night-lab look.
- **Slice 16:** if the tiny models cannot show the attention and position effects.
- **Slice 17:** if the drafter's acceptance rate or the MoE routing comes out useless.

No chapter art is funded before the model it depicts has passed its probe (D25).

## Decisions made while slicing

These carry the same weight as the map's decisions. Each one is settled unless
the human says otherwise.

| #   | Decision                                                                                                                                                                                                                                       | Why                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D31 | On screen, chapters are numbered contiguously 0–15 by ladder index. Code uses slugs. Deep links use the display number (`/#4`).                                                                                                                | The map's tweakable plan recommended it. It must be fixed before the first public post, because links become permanent then.          |
| D32 | **Loop vs. interaction.** Arriving at a chapter restarts its loop. Any control input pauses the loop, and ▶ resumes it. There is no idle auto-resume.                                                                                          | D12 (free exploration) and D24 (auto-play) needed a rule. Pausing on touch lets the user explore without the scene moving under them. |
| D33 | **A missing effect still gets a loop.** If a chapter's model fails its probe after the bounded retries, the loop plays the honest result with a caption saying so, e.g. "this tiny model mostly can't tell yet — here's what it does instead". | D24 and D25 together: a chapter with no effect still has to show something, and it must not fake one.                                 |
| D34 | **Share routes.** Each chapter gets a static `/c/<display>/index.html` with its own link-preview metadata. It redirects to `/#<display>`. The page with `/#N` is the app.                                                                      | Crawlers ignore URL fragments, so `/#N` alone cannot carry per-chapter link-preview images. This amends D29.                          |
| D35 | **Chapter-4 and chapter-5 models are single-layer.** The positions probe (see the copy rules) is exact only for one attention layer without positions.                                                                                         | With several layers, causal attention can infer position even without RoPE, so the "order doesn't matter" claim would be false.       |
| D36 | **The `full` model is trained with GQA** (`nKvHeads < nHeads`). It is also the source for the quantized copy and the target for speculative decoding.                                                                                          | Chapter 10's "readers share notes" has to be real (D25). One model serves chapters 8–13.                                              |
| D37 | **The chapter-2 scene uses the `embed` model's embedding table.** The model is trained with chapter 3's model.                                                                                                                                 | The map listed no model for chapter 2, but its pins must be real vectors.                                                             |
| D38 | **Inference runs in a Web Worker** (CPU TypeScript) and can be cancelled.                                                                                                                                                                      | It keeps the controls responsive while a typed prompt runs. It honours D9: no GPU inference.                                          |
| D39 | **No new workspaces beyond L1.** Chapter data, timelines and look tokens live in `apps/explainer`.                                                                                                                                             | One owner already exists for each. A `packages/chapters` would have only one consumer.                                                |
| D40 | **The dev-only lab routes** (`/lab/*`) are a second Vite entry, `apps/explainer/lab.html`, deployed to preview builds only.                                                                                                                    | Each visual variable needs a fixture surface that doesn't require booting the whole app.                                              |
| D41 | **ffmpeg** (Homebrew) is a build-time tool for the fallback video. It is never used at runtime.                                                                                                                                                | D29 needs recordings. The map's toolchain audit (D30) missed it.                                                                      |

**Resolved OPEN items:**

- **O1:** TinyStories is licensed CDLA-Sharing-1.0 (https://huggingface.co/datasets/roneneldan/TinyStories). Training on it and publishing the weights is fine. The raw data stays out of git, and the help panel credits it.
- **O4:** H100 SXM: 3.35 TB/s HBM3, about 989 dense BF16 TFLOPS (1,979 with sparsity), 80 GB (https://www.nvidia.com/en-us/data-center/h100/). Confirmed in slice 18.
- **O2, O3:** resolved by measurement in slices 16, 17 and 33.
- **O5** (public domain) stays OPEN until slice 36. It blocks only the public post.

## Single-owner invariants

The codebase must read as if it were designed today. Each concept below has
exactly one owner. A second copy is a bug.

| Concept                                                                                                                                 | Owner                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPU device, capabilities, resource registry, frame targets, pass order, depth convention (reverse-Z `depth32float`, clear 0, `greater`) | `packages/renderer` (`device.ts`, `registry.ts`, `frame.ts`)                                                                                                     |
| Camera matrices, `project()`, part world transform (explode and cutaway), occluders, label placement                                    | `packages/renderer` (`camera.ts`, `labels.ts`), on the CPU. The GPU packing, labels, crops and picking all call the same functions.                              |
| The renderer boundary: `FrameInput`, `Renderer`, `FrameReceipt`                                                                         | `packages/renderer/src/frame-input.ts`                                                                                                                           |
| Kit primitives: geometry, bounds, anchors, explode offsets                                                                              | `packages/renderer/src/kit/`, one `build()` per primitive                                                                                                        |
| glTF parsing                                                                                                                            | `packages/renderer/src/gltf.ts`                                                                                                                                  |
| Tuple → `Float32Array` packing of pmndrs `math` values                                                                                  | One helper in `packages/renderer/src/pack.ts`                                                                                                                    |
| Model manifest format, tensor names                                                                                                     | `packages/llm/src/manifest.ts`. It emits a JSON Schema, and the Python exporter conforms to it.                                                                  |
| Tokenizer runtime                                                                                                                       | `packages/llm/src/tokenizer.ts`. The Python trainer writes its format.                                                                                           |
| Forward pass, trace, sampling, KV cache, speculative decoding, quantization                                                             | `packages/llm`                                                                                                                                                   |
| Production arithmetic and cited hardware/config constants                                                                               | `packages/llm/src/scale/`                                                                                                                                        |
| Seeded randomness                                                                                                                       | `packages/llm/src/rng.ts`, injected everywhere                                                                                                                   |
| Model architecture and training                                                                                                         | `training/` (`model.py` with feature flags; each model is a config, not a fork)                                                                                  |
| Clock                                                                                                                                   | `apps/explainer/src/runtime/clock.ts`. The renderer only receives `timeSec`. This is the only file that may call `performance.now`, and a grep test enforces it. |
| Chapter definitions, ladder order, copy, timelines                                                                                      | `apps/explainer/src/chapters/`, validated by `validateChapter()`                                                                                                 |
| Look tokens (palette, HDR emissive, bloom knobs, flow rhythm, type scale)                                                               | `apps/explainer/src/look/look.json`. HUD CSS variables are generated from it, and it is handed to the renderer as `LookConfig`.                                  |
| Camera shot presets                                                                                                                     | `apps/explainer/src/look/shots.json`                                                                                                                             |
| Domain → renderer adapter                                                                                                               | `apps/explainer/src/scene/build-frame.ts` (pure)                                                                                                                 |
| Inference worker lifecycle                                                                                                              | `apps/explainer/src/runtime/session.ts`                                                                                                                          |
| Verification harness, named crops, layer masks                                                                                          | `apps/explainer/scripts/verify.ts` plus `apps/explainer/src/lab/probe.ts`                                                                                        |

**Short-lived seams:**

- **Slice 10 → removed in slice 15.** Chapter 0 calls `nextWords` synchronously on the main thread. Slice 15 moves every inference call into the `session.ts` worker and deletes the synchronous path.
- **Slice 05 → removed in slice 05.** The `/lab/typegpu-smoke` reproduction of an official example is deleted once `frame.ts` passes.

If a slice needs any other seam, name it here together with the slice that removes it.

## Verification gates (every slice)

- **Always green:**
  - `bun run verify` (format, types, lint, tests);
  - `bun apps/explainer/scripts/verify.ts` (hardware adapter, zero console errors, zero WebGPU validation warnings);
  - the registry-baseline test;
  - the llm parity fixtures;
  - `validateChapter()` over every chapter;
  - every earlier slice's held-clock shots.
- **Visual shots:**
  - Hold the clock (`?clock=held&t=…`).
  - Judge exactly the slice's one variable, on its named crop or mask. Everything else is frozen or masked (`?layers=`, `?bloom=0`, `?labels=0`, `?hud=0`).
  - Run [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md) against the named target when there is one. Targets are `assets/reference/`, `explore/directions.html` (Night lab) and the prior accepted shot.
  - Run [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every visual shot, unprimed.
- **Performance** (the dev Mac, 1440×900, DPR 1):
  - GPU frame ≤ 8 ms;
  - p95 frame ≤ 16.7 ms;
  - controls respond within 100 ms while inference runs;
  - `full` model CPU forward ≤ 50 ms per token.

  Measure feature on/off interleaved. These are implementation budgets and are
  never shown as "speed" (D27).

- **Human checkpoints are non-blocking:**
  1. Open the shots with [preview-shots](../../.agents/skills/preview-shots/SKILL.md).
  2. Wait about 5 minutes.
  3. If the human is silent, decide on the evidence and record the call in the slice.
  4. Close the shots, then proceed.
- **Where outputs go:** generated review output goes in gitignored `throwaway/`.
  Canonical baselines stay with the harness. Record the conclusions in the slice
  file.

## Copy rules

These apply to every caption, label, chip and help line (D2, D7, D17, D24, D25).

- **Captions:** 2 storyteller sentences, each at most 25 words, then a
  "Precisely:" line behind one click. `validateChapter()` enforces the limits.
- **Terms:** define every term of art at first use. No ML jargon may appear
  without its plain version first.
- **Analogies:** assume a high-school education and no electrical engineering. The
  analogy never replaces the precise claim.
- **Numbers:** every number names its scale: "this tiny model", "Llama-3-8B",
  "Llama-3-8B on H100 SXM" or "TinyStories". A number that is not from a model,
  arithmetic or a probe cannot be represented in `StatChip`.
- **Honest qualifiers:**
  - Chapter 4: attention weights _show_ what a word draws from. They are not proof of meaning.
  - Chapter 5: the exact claim is "with one attention layer and no positions, shuffling the earlier words doesn't change the prediction" (D35).
  - Chapter 6: "a lot of what the model knows is stored here", not "facts live here".
  - Chapter 10: the sliding window changes outputs, and is not how Llama-3-8B runs.
  - Chapter 14: MoE numbers use named assumptions. Llama-3-8B is not an MoE.
- **Help panel:** it states where each number comes from, like the reference does,
  and credits TinyStories (CDLA-Sharing-1.0).
- **Sources:**
  - Speculative decoding: Leviathan et al. 2023, https://arxiv.org/abs/2211.17192; Chen et al. 2023, https://arxiv.org/abs/2302.01318.
  - RoPE: https://arxiv.org/abs/2104.09864
  - SwiGLU: https://arxiv.org/abs/2002.05202
  - RMSNorm: https://arxiv.org/abs/1910.07467
  - Switch Transformer: https://arxiv.org/abs/2101.03961
  - Mixtral: https://arxiv.org/abs/2401.04088
  - Transformer inference arithmetic: https://kipp.ly/transformer-inference-arithmetic/

## Research record

Captured 2026-09-27. Details are in each slice.

- **TypeGPU 0.12** (https://docs.swmansion.com/TypeGPU/):
  - Render pipelines are stable: `root.createRenderPipeline({...})`, then `.with…().drawIndexed()`.
  - Command encoders and render bundles are still `~unstable`.
  - TGSL needs `unplugin-typegpu@0.12.4`.
  - There is no official bloom example.
  - The mesh examples are 3D Fish (OBJ) and Mesh Skinning (GLB via @loaders.gl).
- **pmndrs `math@0.1.0`** (https://github.com/pmndrs/math): a gl-matrix port using tuples and out-first arguments. Use `mat4.perspectiveZO`, swap near and far for reverse-Z, and `math/shapes` for the frustum and raycasts.
- **Bloom:** Jimenez, SIGGRAPH 2014
  (https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/),
  and LearnOpenGL "Physically Based Bloom"
  (https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom).
- **Headless WebGPU on this Mac** was tested with Playwright 1.63 and Chrome 153, `channel:'chrome'`. It gets hardware Metal with no flags, but only in a secure context.
- **glTF:** the Blender exporter defaults to +Y up (right-handed, front +Z). A hand-written GLB parser is sufficient for uncompressed props.
- **Tiny models:**
  - TinyStories paper: https://arxiv.org/abs/2305.07759. Models under 10M parameters, and even 1-layer ones, are fluent.
  - karpathy/llama2.c: Llama-architecture TinyStories models from 260K parameters up, and a 4096-vocab BPE.
  - There is no primary source for MPS training time; slice 16 benchmarks it.
- **Prior art to stay clear of:**
  - bbycroft.net/llm: high jargon, shows every matrix.
  - Poloclub Transformer Explainer: GPT-2, medium jargon.
  - 3Blue1Brown: video only.
  - Our gap is a model per added component, plus production serving.

## Choices ledger

Decisions an implementer made that their slice did not delegate live in
[choices.md](choices.md).
