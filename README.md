# aiexplainer

Bun + Turborepo monorepo.

## Layout

- `apps/*` — deployable apps and CLIs.
- `packages/*` — shared libraries, imported as `@repo/<name>` via `workspace:*`.
- `packages/typescript-config` — the shared `tsconfig` base; each workspace's
  `tsconfig.json` extends `@repo/typescript-config/base.json`.
- `.agents/skills` — agent skills from [dzhng/skills](https://github.com/dzhng/skills);
  `.claude/skills` symlinks into it.

## Conventions

- Workspaces ship TypeScript source directly (`"exports": { ".": "./src/index.ts" }`);
  only apps that publish or deploy have a `build` step.
- Each workspace defines whichever of `build`, `check-types`, `lint`, `test` it
  needs; the root runs them across the graph with `turbo`.
- Shared dependency versions live in the root `catalog` and are referenced as
  `"catalog:"`.

## Commands

```bash
bun install
cd training && uv sync && cd ..       # Python env for training the tiny models
bun run verify                        # format, types, lint, bun tests, training tests
bun apps/explainer/scripts/verify.ts --route /lab/adapter   # real-GPU browser check
bun run format
```

- `training/` is a uv project (PyTorch on Apple's MPS), not a bun workspace.
