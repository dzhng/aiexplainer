"""Chapter 1 probes over the validation split, and the chapter's scenario prompts (O2).

- How many word occurrences are a single piece.
- A rare word that splits into several pieces: the most frequent lowercase word
  that takes at least `SPLIT_PIECES` pieces, so the example is still recognisable.
- Average characters per token.

The prompts are the most frequent sentence (the everyday case) and the shortest
sentence containing the split word.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import TYPE_CHECKING, Any

from probes.evidence import result

if TYPE_CHECKING:
    from tokenizers import Tokenizer

SPLIT_PIECES = 3
SINGLE_PIECE_THRESHOLD = 0.9
CHARS_PER_TOKEN_THRESHOLD = 3.0
MIN_SENTENCE_WORDS = 6
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def run(hf: Tokenizer, lines: list[str], tokenizer_sha256: str) -> dict[str, Any]:
    """Probe the non-empty lines of the validation split."""
    word_counts = count_words(hf, lines)
    pieces = {word: len(hf.model.tokenize(word)) for word in word_counts}

    total_words = sum(word_counts.values())
    single = sum(n for word, n in word_counts.items() if pieces[word] == 1)
    split_word = max(
        (w for w in word_counts if pieces[w] >= SPLIT_PIECES and w.removeprefix("Ġ").islower()),
        key=lambda w: (word_counts[w], w),
    )
    plain_split_word = split_word.removeprefix("Ġ")

    tokens = sum(len(encoding.ids) for encoding in hf.encode_batch(lines))
    characters = sum(len(line) for line in lines)

    sentences = [s for line in lines for s in SENTENCE_END.split(line.strip())]
    everyday = Counter(s for s in sentences if len(s.split()) >= MIN_SENTENCE_WORDS)
    with_split_word = [
        s for s in sentences if re.search(rf"\b{plain_split_word}\b", s) and len(s.split()) >= 4
    ]

    return {
        "tokenizerSha256": tokenizer_sha256,
        "evidence": [
            result(
                "single-piece-words",
                "",
                "held-out word occurrences that are one piece",
                single / total_words,
                SINGLE_PIECE_THRESHOLD,
            ),
            result("rare-word-split", plain_split_word, "pieces", pieces[split_word], SPLIT_PIECES),
            result(
                "chars-per-token",
                "",
                "held-out characters per token",
                characters / tokens,
                CHARS_PER_TOKEN_THRESHOLD,
            ),
        ],
        "prompts": [
            everyday.most_common(1)[0][0],
            min(with_split_word, key=lambda s: (len(s), s)),
        ],
    }


def count_words(hf: Tokenizer, lines: list[str]) -> Counter[str]:
    """Occurrences of each word piece: letters, optionally after one space ("Ġ")."""
    counted: Counter[str] = Counter()
    for line in lines:
        counted.update(p for p, _ in hf.pre_tokenizer.pre_tokenize_str(line) if is_word(p))
    return counted


def is_word(piece: str) -> bool:
    """A pre-tokenizer piece that is one word: letters, optionally after one space ("Ġ")."""
    letters = piece.removeprefix("Ġ")
    return letters.isascii() and letters.isalpha()
