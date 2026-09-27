# 14 — The shared tokenizer

**Milestone:** M3 · **Depends on:** 02 · **Visual:** none

## Contract

One BPE tokenizer is trained once and frozen, then used by every neural model
(D28). Its TypeScript runtime reproduces Python exactly.

## Seam

- **`training/tokenizer.py`:**
  - Uses HF `tokenizers` (the pinned stable 0.x) `BpeTrainer` over `TinyStoriesV2-GPT4-train.txt`, with a byte-level pre-tokenizer so every string round-trips.
  - Special tokens: `<bos>` and `<eos>`.
  - Writes `apps/explainer/public/models/tokenizer/tokenizer.json` in **our own minimal format** (`{ vocab: string[]; merges: [number, number][]; special: {...} }`), not HF's full JSON. It also records the sha256.
- **`packages/llm/src/tokenizer.ts`:** `loadTokenizer(json) → { encode(text): Uint32Array; decode(ids): string; pieces(ids): { text, byteSpan }[] }`. `pieces` feeds the chapter-1 brick visual.
- **Manifests:** every later manifest sets `tokenizer: { kind: 'bpe', file, sha256 }`. `loadModel` rejects a mismatched hash.

## Playable

`bun packages/llm/cli.ts tokenize "The cat sat on the mat because it was tired."` prints the pieces.

## Verify

- **Parity:** TypeScript `encode` equals Python `encode` on 500 fixture strings. The fixtures are drawn from the validation split, plus Unicode, emoji, empty strings and long words.
- **Property test:** `decode(encode(s)) === s` on random strings.
- **Chapter-1 probe** (`training/probes/tokenizer.py`) measures three things:
  - the fraction of TinyStories words that are a single piece;
  - an example rare word that splits into several pieces;
  - the average characters per token.

  It writes `evidence` and the chapter-1 scenario prompts (O2).

## Resolves

- D28.
- **O2 for chapter 1.**

## Delegated

**Vocabulary size within 2–4k.** Measure it: pick the smallest size where at least 90% of the 500 most common TinyStories words are a single piece, and record the choice here. After this slice the tokenizer is **frozen**. Changing it means retraining every model.

## Stays green

01–13.

## Feedback that would change this slice

None expected.
