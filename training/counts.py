"""Chapter 0's model: word-pair counts over TinyStories.

Text is lowercased and split into words (letters, with inner apostrophes) and the
sentence marks `.`, `!` and `?`; everything else is dropped. Pairs never cross a
story boundary. The model keeps the `V` most frequent words and, for each, its `K`
most frequent successors inside that vocabulary.

    uv run python counts.py      # count the train split, probe, export to the app

The committed test fixture is regenerated with:

    uv run python counts.py --corpus fixtures/counts-corpus.txt \\
        --valid fixtures/counts-corpus.txt --vocab-size 24 --successors 3 \\
        --out fixtures/counts --golden fixtures/counts.golden.json
"""

from __future__ import annotations

import argparse
import json
import mmap
import re
import time
from collections import Counter
from collections.abc import Iterable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import export
from probes import counts as counts_probes

TRAINING_DIR = Path(__file__).resolve().parent
DATA_DIR = TRAINING_DIR / "data"
TRAIN_FILE = DATA_DIR / "TinyStoriesV2-GPT4-train.txt"
VALID_FILE = DATA_DIR / "TinyStoriesV2-GPT4-valid.txt"
OUT_DIR = TRAINING_DIR.parent / "apps/explainer/public/models/counts"

STORY_SEPARATOR = "<|endoftext|>"
WORD_PATTERN = re.compile(r"[a-z]+(?:'[a-z]+)*|[.!?]")
VOCAB_SIZE = 8192
SUCCESSORS_PER_WORD = 20
CHUNK_BYTES = 32 << 20


def words(text: str) -> list[str]:
    """Lowercase `text` and split it into the words and sentence marks the model counts."""
    return WORD_PATTERN.findall(text.lower().replace("’", "'"))


@dataclass
class PairCounts:
    unigrams: Counter[str]
    pairs: Counter[tuple[str, str]]

    def add(self, other: PairCounts) -> None:
        self.unigrams.update(other.unigrams)
        self.pairs.update(other.pairs)


def count_stories(stories: Iterable[str]) -> PairCounts:
    """Count every word and every adjacent word pair, story by story."""
    unigrams: Counter[str] = Counter()
    pairs: Counter[tuple[str, str]] = Counter()
    for story in stories:
        tokens = words(story)
        unigrams.update(tokens)
        pairs.update(zip(tokens, tokens[1:]))
    return PairCounts(unigrams, pairs)


def story_ranges(path: Path) -> list[tuple[int, int]]:
    """Split a TinyStories file into byte ranges of about `CHUNK_BYTES` that end on story boundaries."""
    separator = STORY_SEPARATOR.encode()
    ranges = []
    with path.open("rb") as file, mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ) as data:
        start = 0
        while start < len(data):
            found = data.find(separator, start + CHUNK_BYTES)
            end = len(data) if found < 0 else found + len(separator)
            ranges.append((start, end))
            start = end
    return ranges


def count_range(path: Path, start: int, end: int) -> PairCounts:
    with path.open("rb") as file:
        file.seek(start)
        text = file.read(end - start).decode("utf-8")
    return count_stories(text.split(STORY_SEPARATOR))


def count_file(path: Path) -> PairCounts:
    """Count a TinyStories file, one story-aligned byte range per worker task."""
    ranges = story_ranges(path)
    total = PairCounts(Counter(), Counter())
    with ProcessPoolExecutor() as pool:
        for part in pool.map(count_range, [path] * len(ranges), *zip(*ranges)):
            total.add(part)
    return total


@dataclass
class CountsTable:
    """The exported model: row `i` holds word `vocab[i]`'s top successors, most frequent first."""

    vocab: list[str]
    successors: np.ndarray  # uint32 [V, K], vocab indices; 0 where count is 0
    counts: np.ndarray  # uint32 [V, K]; 0 pads words with fewer than K successors

    def next_words(self, word: str, k: int) -> list[dict[str, object]]:
        """Reference for `nextWords` in packages/llm: top-k successors with p over the kept K."""
        try:
            row = self.vocab.index(word.lower())
        except ValueError:
            return []
        counts = [int(c) for c in self.counts[row] if c > 0]
        total = sum(counts)
        return [
            {"word": self.vocab[int(s)], "count": c, "p": c / total}
            for s, c in zip(self.successors[row][:k], counts[:k])
        ]


def build_table(counted: PairCounts, vocab_size: int, successors_per_word: int) -> CountsTable:
    """Keep the top words (ties broken alphabetically) and each word's top successors."""
    ranked = sorted(counted.unigrams.items(), key=lambda item: (-item[1], item[0]))
    vocab = [word for word, _ in ranked[:vocab_size]]
    index = {word: i for i, word in enumerate(vocab)}

    rows: list[list[tuple[int, int]]] = [[] for _ in vocab]
    for (first, second), count in counted.pairs.items():
        if first in index and second in index:
            rows[index[first]].append((count, index[second]))

    successors = np.zeros((len(vocab), successors_per_word), dtype=np.uint32)
    counts = np.zeros((len(vocab), successors_per_word), dtype=np.uint32)
    for i, row in enumerate(rows):
        row.sort(key=lambda item: (-item[0], item[1]))
        for j, (count, successor) in enumerate(row[:successors_per_word]):
            successors[i, j] = successor
            counts[i, j] = count
    return CountsTable(vocab, successors, counts)


def vocab_codepoints(vocab: list[str]) -> np.ndarray:
    """Pack words as rows of Unicode code points, zero-padded to the longest word."""
    width = max(len(word) for word in vocab)
    packed = np.zeros((len(vocab), width), dtype=np.uint32)
    for i, word in enumerate(vocab):
        packed[i, : len(word)] = [ord(char) for char in word]
    return packed


def export_table(
    table: CountsTable,
    out_dir: Path,
    *,
    tokens_seen: int,
    wall_seconds: float,
    evidence: list[dict[str, object]],
) -> None:
    export.export_model(
        out_dir,
        model_id="counts",
        kind="word-counts",
        tokenizer={"kind": "words", "vocabTensor": "vocab"},
        tensors={
            "vocab": vocab_codepoints(table.vocab),
            "successors": table.successors,
            "counts": table.counts,
        },
        training=export.training_record(
            seed=0, steps=0, tokens_seen=tokens_seen, wall_seconds=wall_seconds
        ),
        evidence=evidence,
    )


def write_golden(table: CountsTable, path: Path) -> None:
    """Reference `nextWords` results for every word, plus a capitalised and an unknown word."""
    k = table.counts.shape[1]
    capitalised = next(word for word in table.vocab if word.isalpha()).capitalize()
    queries = [*table.vocab, capitalised, "zebra"]
    cases = [{"word": word, "k": k, "next": table.next_words(word, k)} for word in queries]
    path.write_text(json.dumps(cases, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=TRAIN_FILE)
    parser.add_argument("--valid", type=Path, default=VALID_FILE)
    parser.add_argument("--vocab-size", type=int, default=VOCAB_SIZE)
    parser.add_argument("--successors", type=int, default=SUCCESSORS_PER_WORD)
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    parser.add_argument("--golden", type=Path, help="also write reference nextWords results here")
    args = parser.parse_args()

    start = time.monotonic()
    counted = count_file(args.corpus)
    table = build_table(counted, args.vocab_size, args.successors)
    wall_seconds = time.monotonic() - start

    valid = count_file(args.valid)
    evidence = counts_probes.run(table, valid)
    for result in evidence:
        print(result)
    export_table(
        table,
        args.out,
        tokens_seen=sum(counted.unigrams.values()),
        wall_seconds=wall_seconds,
        evidence=evidence,
    )
    if args.golden:
        write_golden(table, args.golden)


if __name__ == "__main__":
    main()
