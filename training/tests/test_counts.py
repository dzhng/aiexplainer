import json
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

import counts
from manifest_schema import APP_MODELS_DIR, validate_manifest

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
CORPUS = FIXTURES / "counts-corpus.txt"


def test_words_lowercases_and_keeps_only_words_and_sentence_marks():
    text = "Lily’s mom said, “Don't go!” Tom's dog ran... Fast?"
    assert counts.words(text) == [
        "lily's", "mom", "said", "don't", "go", "!", "tom's", "dog", "ran", ".", ".", ".", "fast", "?",
    ]  # fmt: skip


def test_exact_counts_on_the_fixture_corpus():
    counted = counts.count_file(CORPUS)
    assert counted.unigrams["cat"] == 6
    assert counted.unigrams["lily"] == 4  # "Lily’s" counts as "lily's"
    assert counted.pairs["once", "upon"] == 4
    assert counted.pairs["the", "cat"] == 5
    assert counted.pairs["tom's", "dog"] == 1
    # Stories end with "." and the next one starts with "once"; pairs never cross that boundary.
    assert counted.pairs[".", "once"] == 0


def test_counting_in_many_ranges_matches_one_pass(monkeypatch: pytest.MonkeyPatch):
    whole = counts.count_stories(CORPUS.read_text().split(counts.STORY_SEPARATOR))
    monkeypatch.setattr(counts, "CHUNK_BYTES", 40)
    assert len(counts.story_ranges(CORPUS)) == 4
    split = counts.count_file(CORPUS)
    assert split.unigrams == whole.unigrams
    assert split.pairs == whole.pairs


def test_table_keeps_top_words_and_their_top_successors_in_vocab():
    counted = counts.PairCounts(
        Counter({"a": 5, "b": 3, "c": 3, "d": 1}),
        Counter({("a", "b"): 2, ("a", "c"): 2, ("a", "d"): 9, ("b", "a"): 1}),
    )
    table = counts.build_table(counted, vocab_size=3, successors_per_word=2)
    assert table.vocab == ["a", "b", "c"]  # ties broken alphabetically
    # "d" is outside the vocabulary, so a's successors are b and c, tied, in vocab order.
    assert table.next_words("a", 5) == [
        {"word": "b", "count": 2, "p": 0.5},
        {"word": "c", "count": 2, "p": 0.5},
    ]
    assert table.next_words("c", 5) == []
    assert table.next_words("zebra", 5) == []
    assert table.counts.dtype == np.uint32


def test_committed_fixture_export_matches_the_code(tmp_path: Path):
    """The TypeScript parity test reads the committed fixture; it must be what the code produces."""
    counted = counts.count_file(CORPUS)
    table = counts.build_table(counted, vocab_size=24, successors_per_word=3)
    counts.export_table(table, tmp_path, tokens_seen=180, wall_seconds=0, evidence=[])
    counts.write_golden(table, tmp_path / "golden.json")

    committed = FIXTURES / "counts"
    assert (tmp_path / "weights.bin").read_bytes() == (committed / "weights.bin").read_bytes()
    assert (tmp_path / "golden.json").read_text() == (FIXTURES / "counts.golden.json").read_text()
    fresh = json.loads((tmp_path / "manifest.json").read_text())
    assert fresh["tensors"] == json.loads((committed / "manifest.json").read_text())["tensors"]


@pytest.mark.parametrize("manifest_dir", [FIXTURES / "counts", APP_MODELS_DIR / "counts"])
def test_exported_counts_manifest_validates_against_the_schema(manifest_dir: Path):
    manifest = json.loads((manifest_dir / "manifest.json").read_text())
    validate_manifest(manifest)
    assert manifest["evidence"], "D25: every model ships measured evidence"
