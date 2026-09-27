# 01 — Scaffold and verification harness

**Milestone:** M1 (D14) · **Depends on:** nothing · **Visual:** none (probe page only)

## Contract

The three workspaces and the training project exist and build. A real-GPU
browser harness can open any route, assert a hardware WebGPU adapter, hold the
clock, and fail on any console error or WebGPU validation warning. Every later
slice uses this harness to verify itself.

## Seam

- **Workspaces** (L1, D39):
  - `apps/explainer`: Vite + React 19, with `plugins: [react(), typegpu()]` from `unplugin-typegpu@0.12.4`.
  - `packages/renderer` and `packages/llm`: each has a `package.json` with `"exports": { ".": "./src/index.ts" }`, a tsconfig that extends `@repo/typescript-config/base.json`, and `check-types`, `lint` and `test` scripts.
  - Pin `typegpu@0.12.6` and `math@0.1.0` **exactly** in the root `catalog`.
- **Training:** `training/` is a uv project (`pyproject.toml`, `uv.lock`) with torch pinned (MPS), `tokenizers` pinned to a stable 0.x, and pytest. It is not a bun workspace. Add a `training:test` script at the root.
- **Clock** (`apps/explainer/src/runtime/clock.ts`):
  - `interface Clock { now(): number }` (seconds, monotonic).
  - Implementations: `rafClock()`, `heldClock(t)` (with `set(t)`), and `stepClock(fps)` (with `step()`, used by the recorder).
  - The URL `?clock=held&t=12.5` selects `heldClock`.
  - A grep test fails if `performance.now` or `Date.now` appears anywhere else in `apps/` or `packages/`.
- **Probe API** (`apps/explainer/src/lab/probe.ts`):
  - Exposed on `window.__explainer`.
  - Members: `ready: Promise<void>`, `adapter: { vendor, architecture, isFallbackAdapter }`, `setTime(t)`, `errors: string[]`.
  - Later slices add `goto`, `setUi`, `receipt`, `labels` and `crops`.
- **Lab entry** (D40): `apps/explainer/lab.html`, with the route `/lab/adapter`.
- **Harness** (`apps/explainer/scripts/verify.ts`), modelled on `~/dev/3d-harness/apps/workbench/scripts/verify.mjs`:
  - Launch with `chromium.launch({ headless: true, channel: 'chrome' })`.
  - Serve the Vite preview on `http://localhost` (WebGPU needs a secure context).
  - Arguments: `--route <path>`, `--t <sec>`, `--crop <id>`, `--mask <query>`, `--out <dir>`.
  - Screenshots go to `throwaway/shots/<slice>/`.
  - It fails when `isFallbackAdapter` is true, when `errors.length > 0`, or on any console message at warning level or above.

## Playable

`bun run --cwd apps/explainer dev`, then open `/lab/adapter.html`. It prints the adapter info.
`bun apps/explainer/scripts/verify.ts --route /lab/adapter` passes headless.

## Verify

- `bun run verify` is green across all workspaces. `bun run training:test` is green on a trivial test.
- The harness prints vendor `apple`, architecture `metal-*`, and `isFallbackAdapter: false`.
- Negative test: the harness launched with the default headless shell reports **no adapter** and exits non-zero. This proves the gate is real.
- Clock unit tests:
  - `heldClock` returns what `set` gave it.
  - `stepClock(30)` advances by exactly 1/30 per step.
- The grep test for `performance.now` passes.

## Resolves

- Confirm-list item: headless hardware WebGPU. Research proved it; this slice encodes it as an assertion.
- Confirm-list item: exact pins for `typegpu` and `math`.

## Delegated to the implementer

Internal file layout, Vite config details, the turbo task wiring, and how the harness serves the build (`vite preview` or a tiny static server).

## Stays green

The root scaffold scripts (`format:check`, `check-types`, `lint`).

## Feedback that would change this slice

A preference for keeping verification in a separate workspace, e.g. `apps/verify`.
