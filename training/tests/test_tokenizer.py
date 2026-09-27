import hashlib
import json
from pathlib import Path

import tokenizer
from schemas import validate

FIXTURE_CORPUS = Path(__file__).resolve().parents[1] / "fixtures/counts-corpus.txt"


def test_the_committed_tokenizer_is_the_frozen_one():
    assert hashlib.sha256(tokenizer.TOKENIZER_FILE.read_bytes()).hexdigest() == tokenizer.TOKENIZER_SHA256


def test_tokenizer_files_validate_against_the_runtime_schemas():
    data = json.loads(tokenizer.TOKENIZER_FILE.read_text())
    validate(data, "tokenizer.schema.json")
    assert data["special"] == {"bos": 0, "eos": 1}
    evidence = json.loads(tokenizer.EVIDENCE_FILE.read_text())
    validate(evidence, "tokenizer-evidence.schema.json")
    assert evidence["tokenizerSha256"] == tokenizer.TOKENIZER_SHA256


def test_parity_fixtures_are_the_reference_encoding_of_the_committed_tokenizer():
    """The TypeScript parity test compares against these ids; they must be HF's."""
    reference = tokenizer.from_minimal(json.loads(tokenizer.TOKENIZER_FILE.read_text()))
    cases = json.loads(tokenizer.PARITY_FILE.read_text())
    assert len(cases) == tokenizer.PARITY_STRINGS
    for case in cases:
        assert tokenizer.encode(reference, case["text"]) == case["ids"], case["text"]


def test_our_format_encodes_exactly_like_the_trained_hf_tokenizer():
    trained = tokenizer.train(FIXTURE_CORPUS, vocab_size=320)
    rebuilt = tokenizer.from_minimal(tokenizer.to_minimal(trained, vocab_size=320))
    for text in [FIXTURE_CORPUS.read_text(), *tokenizer.EDGE_CASES]:
        assert tokenizer.encode(rebuilt, text) == tokenizer.encode(trained, text)
        assert rebuilt.decode(tokenizer.encode(rebuilt, text)) == text


def test_truncating_keeps_the_first_merges_and_their_tokens():
    trained = tokenizer.train(FIXTURE_CORPUS, vocab_size=320)
    small = tokenizer.truncate(tokenizer.to_minimal(trained, vocab_size=320), 300)
    assert len(small["vocab"]) == 300
    assert len(small["merges"]) == 300 - tokenizer.BASE_VOCAB
    assert small == tokenizer.to_minimal(trained, vocab_size=300)
