# packages/llm

The model runtime in plain TypeScript, run on the CPU in a Web Worker in the browser
(D9, D38). It loads the committed models in `apps/explainer/public/models/`, runs them,
and computes the production-scale numbers the chapters quote. Everything here is pure and
seeded, so a run is reproducible and bun-testable.

## Owners

- **The model format.** `src/manifest.ts` is the one definition of a model's
  `manifest.json` and its tensor names. `bun run --cwd packages/llm schema` emits it as
  JSON Schema into `schema/`, and the Python exporter validates against that schema.
  `src/load.ts` checks a manifest against its `weights.bin` (sha256 and layout) and
  exposes each tensor as a typed-array view, without copying.
- **The tokenizer.** `src/tokenizer.ts` is the runtime for the shared byte-level BPE.
  `training/tokenizer.py` writes the format and freezes it.
- **The forward pass.** `src/forward.ts` mirrors `training/model.py` feature for feature.
  It also produces the traces the scenes draw: attention weights, residual streams, MLP
  activations and router picks. Parity fixtures written by PyTorch pin the two together,
  so a change on one side fails the other's tests.
- **Sampling, generation, KV cache, speculative decoding, 8-bit weights.** One module
  each (`sample`, `generate`, `kvcache`, `speculative`, `quantize`). Every draw takes an
  injected `Rng` from `src/rng.ts`, the only source of randomness.
- **What a chapter may quote.** A stat chip names a metric or a probe (`src/metrics.ts`)
  or an arithmetic function (`src/scale/registry.ts`), never a typed number. The model
  numbers come from the model files. The production numbers come from `src/scale/`: a
  roofline model built on cited constants in `scale/data/*.json`. Its unit brands
  (`scale/units.ts`) stop the compiler from mixing bytes with seconds.

## Tools

- `cli.ts` is a dev CLI over the committed models: next words, tokenize, forward and
  speculate.
- `scripts/next-token-probs.ts` lets the Python probes measure exactly what the browser
  computes.
- `scripts/bench-forward.ts` times the CPU forward pass against the per-token budget.
