// Chapter 0's model: for each known word, its most frequent next words in TinyStories.
// The reference implementation is `CountsTable.next_words` in training/counts.py.
import { type LoadedModel, tensor } from "./load.ts";

export interface CountsModel {
  vocab: readonly string[];
  /** Splits text into the words and sentence marks the model counts (the manifest's rule). */
  split: (text: string) => string[];
  index: ReadonlyMap<string, number>;
  /** Successors kept per word (the row width of the tables below). */
  successorsPerWord: number;
  /** [vocab, successorsPerWord] vocab indices, most frequent first. */
  successors: Uint32Array;
  /** [vocab, successorsPerWord] pair counts; 0 pads short rows. */
  counts: Uint32Array;
}

export interface NextWord {
  word: string;
  count: number;
  /** The share of this word among the successors the model kept. */
  p: number;
}

export function countsModel(model: LoadedModel): CountsModel {
  const { manifest } = model;
  if (manifest.kind !== "word-counts") {
    throw new Error(`${manifest.id} is not a word-counts model`);
  }
  const vocabTensor = tensor(model, manifest.tokenizer.vocabTensor, "u32");
  const successors = tensor(model, "successors", "u32");
  const counts = tensor(model, "counts", "u32");
  const [vocabSize, successorsPerWord] = successors.shape;
  if (
    vocabSize === undefined ||
    successorsPerWord === undefined ||
    vocabTensor.shape[0] !== vocabSize ||
    String(counts.shape) !== String(successors.shape)
  ) {
    throw new Error(`${manifest.id}: vocab, successors and counts shapes disagree`);
  }
  const vocab = decodeVocab(vocabTensor.data, vocabSize);
  const { pattern, replace } = manifest.tokenizer;
  const regex = new RegExp(pattern, "gu");
  const split = (text: string) => {
    let normal = text.toLowerCase();
    for (const [from, to] of replace) normal = normal.replaceAll(from, to);
    return normal.match(regex) ?? [];
  };
  return {
    vocab,
    split,
    index: new Map(vocab.map((word, i) => [word, i])),
    successorsPerWord,
    successors: successors.data,
    counts: counts.data,
  };
}

/** The `k` most frequent successors of `word`; `[]` for a word the model never kept. */
export function nextWords(model: CountsModel, word: string, k: number): NextWord[] {
  const row = model.index.get(word.toLowerCase());
  if (row === undefined) return [];
  const start = row * model.successorsPerWord;
  const counts = model.counts.subarray(start, start + model.successorsPerWord);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const result: NextWord[] = [];
  for (let j = 0; j < Math.min(k, counts.length) && counts[j]! > 0; j++) {
    const count = counts[j]!;
    result.push({ word: model.vocab[model.successors[start + j]!]!, count, p: count / total });
  }
  return result;
}

function decodeVocab(codepoints: Uint32Array, vocabSize: number): string[] {
  const width = codepoints.length / vocabSize;
  return Array.from({ length: vocabSize }, (_, i) => {
    const row = codepoints.subarray(i * width, (i + 1) * width);
    const end = row.indexOf(0);
    return String.fromCodePoint(...(end < 0 ? row : row.subarray(0, end)));
  });
}
