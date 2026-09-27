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

## Result (measured 2026-09-27)

**Chosen vocabulary size: 2048** (2 special tokens + 256 bytes + 1790 merges).
sha256 `2ce41742d62977488c2304f2b44cc9a297e24ab24b3fc2b3ffd59284391c81a2`, frozen
as `TOKENIZER_SHA256` in `training/tokenizer.py`. Training twice gave the same file.

"Word" means a pre-tokenizer piece of ASCII letters with its leading space, as it
appears mid-sentence (" the"), counted on the validation split. The rule does not
bind inside 2–4k: every candidate already makes 100% of the 500 most common words
one piece, so it reduces to the lower bound.

| Vocab | Top 500 one piece | Top 2000 one piece | Word occurrences one piece | Chars per token |
| ----- | ----------------- | ------------------ | -------------------------- | --------------- |
| 1024  | 0.668             | 0.173              | 0.789                      | 3.20            |
| 1536  | 1.000             | 0.336              | 0.870                      | 3.54            |
| 2048  | 1.000             | 0.485              | 0.907                      | 3.72            |
| 3072  | 1.000             | 0.796              | 0.947                      | 3.92            |
| 4096  | 1.000             | 0.993              | 0.969                      | 4.03            |

Chapter-1 probes (`apps/explainer/public/models/tokenizer/evidence.json`): 90.7% of
held-out word occurrences are one piece; " ugly" is the most frequent lowercase word
that takes 3 pieces; 3.72 characters per token. Prompts (O2): "Once upon a time,
there was a little boy named Tim." and "It was so ugly."

## Stays green

01–13.

## Feedback that would change this slice

None expected.
