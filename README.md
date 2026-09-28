# aiexplainer

"How LLMs work, from first principles": an interactive 3D explainer that starts from
word-pair counts and adds one part per chapter until it reaches a production LLM. Every
part is a machine drawn on the GPU and backed by a real tiny model trained for that
chapter. Bun + Turborepo monorepo; why it is built this way, and the decisions behind it,
live in [specs/done/llm-explainer](specs/done/llm-explainer/README.md).

## Layout

The tree splits by what each part owns. A concept has exactly one home. A second copy is
a bug, so find the owner before writing a helper.

- [`apps/explainer`](apps/explainer/README.md): the site. It holds chapters as data,
  scene builders that turn model output into frames, the HUD, the lab review pages and
  the browser harness.
- [`packages/renderer`](packages/renderer/README.md): the WebGPU renderer (TypeGPU). It
  draws the `FrameInput` it is handed and never reads app state. It owns the camera math,
  label placement and the kit of scene primitives.
- [`packages/llm`](packages/llm/README.md): the model runtime in plain TypeScript. It
  owns the manifest format, the tokenizer, the forward pass, sampling and the
  production-scale arithmetic.
- [`training`](training/README.md): the PyTorch side, a uv project rather than a bun
  workspace. It trains, probes and exports every model into
  `apps/explainer/public/models`.
- `assets/blender`: Blender scripts that build the committed props
  (`bun run props:build`). Every asset can be reproduced from code.
- `packages/typescript-config`: the shared `tsconfig` base.
- `.agents/skills`: agent skills from [dzhng/skills](https://github.com/dzhng/skills).
  `.claude/skills` symlinks into it. Read [renderer](.agents/skills/renderer/SKILL.md)
  before GPU work.

## Conventions

- Workspaces ship TypeScript source directly (`"exports": { ".": "./src/index.ts" }`).
  Only the app has a `build` step.
- Each workspace defines whichever of `build`, `check-types`, `lint` and `test` it needs.
  The root runs them across the graph with `turbo`.
- Shared dependency versions live in the root `catalog` and are referenced as
  `"catalog:"`. `typegpu` and `math` are young, so they are pinned exactly.
- Greenfield: hard cutovers, no compatibility shims.

## Commands

```bash
bun install
cd training && uv sync && cd ..   # the Python env, only needed to retrain
bun run verify                    # format, types, lint, bun tests, training tests
bun run format
```

The browser harness, which runs on a real GPU, is described in
[apps/explainer](apps/explainer/README.md#verification).
