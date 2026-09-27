# 02 — Model manifest and the word-pair counts model

**Milestone:** M1 · **Depends on:** 01 · **Visual:** none

## Contract

There is one model file format shared by `training/` and `packages/llm`. The
first real model, chapter 0's word-pair counts, is trained, exported, committed,
loaded in TypeScript and queried with exact results.

## Seam

- **`packages/llm/src/manifest.ts`** is the single owner of the format.
  - Define the format as a zod schema.
  - `bun run --cwd packages/llm schema` emits `packages/llm/schema/manifest.schema.json`. `training/` validates against it in pytest.
  ```ts
  interface ModelManifest {
    formatVersion: 1;
    id: ModelId;
    kind: "word-counts" | "transformer";
    tokenizer:
      | { kind: "words"; vocabTensor: string }
      | { kind: "bpe"; file: string; sha256: string };
    arch?: TransformerArch; // added in slice 15
    weightsFile: string;
    weightsSha256: string;
    tensors: {
      name: string;
      dtype: "f16" | "f32" | "u32" | "q8_0";
      shape: number[];
      byteOffset: number;
      byteLength: number;
    }[];
    training: {
      dataset: "TinyStoriesV2-GPT4";
      license: "CDLA-Sharing-1.0";
      seed: number;
      steps: number;
      tokensSeen: number;
      valLoss?: number;
      wallSeconds: number;
      torch: string;
      gitSha: string;
    };
    evidence: ProbeResult[]; // D25: measured, never asserted
  }
  interface ProbeResult {
    probe: string;
    prompt: string;
    metric: string;
    value: number;
    threshold: number;
    pass: boolean;
  }
  ```
- **`packages/llm/src/load.ts`:** `loadModel(manifest, weights: ArrayBuffer): LoadedModel`. It validates the manifest, checks the sha256, and exposes typed-array views without copying.
- **`packages/llm/src/counts.ts`:** `nextWords(model, word, k): { word: string; count: number; p: number }[]`. Unknown words return `[]`.
- **Counting:** `training/counts.py` lowercases, splits on words and sentence punctuation, and counts word pairs over `TinyStoriesV2-GPT4-train.txt`.
  - Keep the top `V` words and the top `K` successors per word.
  - Budget: `weights.bin` ≤ 2 MB.
- **Export:** `training/export.py` is the one exporter for every model. It writes `apps/explainer/public/models/counts/{manifest.json, weights.bin}`, and the output is committed (D30).
- **Raw data:** the raw corpus downloads to `training/data/`, which is gitignored.

## Playable

`bun packages/llm/cli.ts next counts "the"` prints the top successors with their counts and probabilities.

## Verify

- pytest:
  - Exact counts on a committed 20-line fixture corpus.
  - The exported manifest validates against the emitted JSON Schema.
- bun test:
  - The loader rejects a wrong sha256, an overlapping tensor range and an unknown dtype.
  - f16 decodes correctly.
  - `nextWords` on the fixture export matches the Python golden `training/fixtures/counts.golden.json` exactly.
  - Probabilities sum to 1 per word, within 1e-6.
- The `counts` manifest has a non-empty `evidence` entry, e.g. `probe: 'top-successor', prompt: 'once upon a', metric: 'p(time)'`.

## Resolves

- **O1:** CDLA-Sharing-1.0, recorded in `training.license`. The help panel copy is written in slice 04.
- **O2 for chapter 0:** the example prompt is picked by `training/probes/counts.py`. It ranks candidate words by how peaked their successor distribution is.
- The weight-format call from the map's tweakable plan: fp16 plus a JSON manifest. Counts are stored as `u32`.

## Delegated

`V`, `K` and the tokenisation regex (within the byte budget), and the CLI output format.

## Stays green

Slice 01's harness and tests.

## Feedback that would change this slice

If the human wants chapter 0 to count BPE tokens instead of words. That would contradict the map ladder, where chapter 0 comes before the tokenizer.
