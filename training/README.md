# training

The PyTorch side, a uv project that runs on Apple's MPS. It trains every tiny model in
the ladder on TinyStories, probes it, and exports it into `apps/explainer/public/models/`,
where the models are committed. The app never trains anything. It only runs what is
exported here, through `packages/llm`.

## Principles

- **One model, many configs.** `model.py` is the one transformer. Every chapter's model
  is that module with different feature flags (`Arch`), and each model is one file in
  `configs/<id>.toml`, never a fork. `packages/llm/src/forward.ts` mirrors it, and the
  random-init parity fixtures (`fixtures/make_parity.py`) pin the two together.
- **One format.** `export.py` writes every model as `manifest.json` plus `weights.bin`.
  The format is owned by `packages/llm/src/manifest.ts`, which emits the JSON Schema the
  exports are validated against. Change it there first.
- **Frozen inputs.** The BPE tokenizer (`tokenizer.py`) is trained once and frozen, and
  its sha256 is recorded in the module. Changing it means retraining every neural model.
  Where the raw TinyStories files live, and how stories are separated in them, is
  `paths.py`. The data itself is gitignored under `data/`.
- **No effect without a probe (D25).** Each model is probed after training (`probes/`,
  dispatched by `probes/models.py`). The measured results go into the manifest's
  `evidence`, which is what the chapters' stat chips and captions may quote. A probe
  that fails is recorded as failing, and the chapter says so (D33). Probes that must
  match the browser run the TypeScript runtime itself (`probes/runtime.py`).
- **Export gates.** A model that fails a hard gate is not exported. For example, the MoE
  router must spread its tokens (`train.moe_export_gate`).

## Running

```bash
uv sync
uv run python data.py                 # tokenize TinyStories into data/ once
uv run python train_all.py embed attn # train, probe and export configs by id
uv run python quantize.py             # full → full-q8
uv run pytest -q                      # also part of the root `bun run verify`
```

`counts.py` (chapter 0's word-pair model) and `tokenizer.py` each have their own entry
point, and their headers explain how to regenerate their fixtures.
