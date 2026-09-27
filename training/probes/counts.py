"""Chapter 0 probes: measured on the counts table, written to the manifest's `evidence`.

The example prompt (O2) is the common word with the most peaked successor
distribution: the one whose single top successor takes the largest share.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from probes.evidence import result

if TYPE_CHECKING:
    from counts import CountsTable, PairCounts

CANDIDATE_WORDS = 200
PEAKED_THRESHOLD = 0.5
COVERAGE_THRESHOLD = 0.98
HELD_OUT_HIT_THRESHOLD = 0.5


def most_peaked_word(table: CountsTable) -> tuple[str, dict[str, Any]]:
    """Among the most frequent words, the one whose top successor has the highest p."""
    best: tuple[str, dict[str, Any]] | None = None
    for word in table.vocab[:CANDIDATE_WORDS]:
        if not word.isalpha():
            continue
        top = table.next_words(word, 1)
        if top and (best is None or top[0]["p"] > best[1]["p"]):
            best = (word, top[0])
    assert best is not None
    return best


def run(table: CountsTable, held_out: PairCounts) -> list[dict[str, Any]]:
    word, top = most_peaked_word(table)
    in_vocab = set(table.vocab)
    total_words = sum(held_out.unigrams.values())
    covered_words = sum(n for w, n in held_out.unigrams.items() if w in in_vocab)

    index = {w: i for i, w in enumerate(table.vocab)}
    kept = {
        (table.vocab[i], table.vocab[int(s)])
        for i in range(len(table.vocab))
        for s, c in zip(table.successors[i], table.counts[i])
        if c > 0
    }
    pairs_from_vocab = sum(n for (a, _), n in held_out.pairs.items() if a in index)
    pairs_in_table = sum(n for pair, n in held_out.pairs.items() if pair in kept)

    return [
        result("top-successor", word, f"p({top['word']})", top["p"], PEAKED_THRESHOLD),
        result(
            "vocab-coverage",
            "",
            "held-out words in vocab",
            covered_words / total_words,
            COVERAGE_THRESHOLD,
        ),
        result(
            "held-out-next-word",
            "",
            "held-out next words in the successor table",
            pairs_in_table / pairs_from_vocab,
            HELD_OUT_HIT_THRESHOLD,
        ),
    ]
