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

**Vocabulary size within 2–4k.** Measure it: pick the smallest size in 2–4k where at least 99% of the 2000 most common TinyStories words are a single piece, and record the choice here. After this slice the tokenizer is **frozen**. Changing it means retraining every model.

The rule was first "90% of the 500 most common words". That rule never binds in 2–4k
(100% at every size from 1536 up), so it picked 2048. The orchestrator raised it,
because chapters 4–8 draw one pipe or clock per token, and the pictures only read if
tokens are mostly whole words. llama2.c also uses 4096 for TinyStories.

## Result (measured 2026-09-27)

**Chosen vocabulary size: 4096** (2 special tokens + 256 bytes + 3838 merges).
sha256 `37c465794d44d16554106eb9d2972c123e05fb76c300bb4bf1cc321fcb363f7b`, frozen
as `TOKENIZER_SHA256` in `training/tokenizer.py`. Training is deterministic (two full
runs at the earlier rule gave byte-identical files).

"Word" means a pre-tokenizer piece of ASCII letters with its leading space, as it
appears mid-sentence (" the"), counted on the validation split.

| Vocab | Top 2000 one piece | Word occurrences one piece | Chars per token |
| ----- | ------------------ | -------------------------- | --------------- |
| 2048  | 0.485              | 0.907                      | 3.72            |
| 2304  | 0.561              |                            |                 |
| 2560  | 0.640              | 0.931                      | 3.83            |
| 2816  | 0.718              |                            |                 |
| 3072  | 0.796              | 0.947                      | 3.92            |
| 3328  | 0.867              |                            |                 |
| 3584  | 0.930              |                            |                 |
| 3840  | 0.972              |                            |                 |
| 4096  | **0.993**          | 0.969                      | 4.03            |

Chapter-1 probes (`apps/explainer/public/models/tokenizer/evidence.json`): 96.9% of
held-out word occurrences are one piece; " birdcage" is the most frequent lowercase
word that still takes 3 pieces; 4.03 characters per token. Prompts (O2): "Once upon
a time, there was a little boy named Tim." and "It was a birdcage!"

## Stays green

01–13.

## Feedback that would change this slice

None expected.
