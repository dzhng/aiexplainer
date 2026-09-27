"""The shared BPE tokenizer (D28): trained once on TinyStories, then frozen.

HF `tokenizers` trains a byte-level BPE; we write it in our own minimal format,
read by `packages/llm/src/tokenizer.ts`:

    { "vocab": [...], "merges": [[left, right], ...], "special": {"bos": 0, "eos": 1} }

`vocab` holds GPT-2 byte-level strings (each byte mapped to one printable
character, so a space is "Ġ"); merge `i` has rank `i` and produces the vocab entry
spelled `vocab[left] + vocab[right]`. Text is split into pieces by the GPT-2
pattern before merging, and `encode` never parses special tokens out of text.

    uv run python tokenizer.py      # train, pick the vocabulary size, probe, write

BPE merges are learned greedily, so a tokenizer of size V is the first V - 258
merges of a larger one; we train once at the largest candidate and truncate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers

from paths import FIXTURES_DIR, MODELS_DIR, TRAIN_FILE, VALID_FILE
from probes import tokenizer as tokenizer_probes

OUT_DIR = MODELS_DIR / "tokenizer"
TOKENIZER_FILE = OUT_DIR / "tokenizer.json"
EVIDENCE_FILE = OUT_DIR / "evidence.json"
PARITY_FILE = FIXTURES_DIR / "tokenizer.parity.json"

STORY_SEPARATOR = "<|endoftext|>"
SPECIAL_TOKENS = {"bos": "<bos>", "eos": "<eos>"}
BASE_VOCAB = len(SPECIAL_TOKENS) + 256
CANDIDATE_SIZES = range(2048, 4096 + 1, 256)
COMMON_WORDS = 2000
SINGLE_PIECE_TARGET = 0.99
PARITY_STRINGS = 500
SEED = 0

# The frozen tokenizer. Changing it means retraining every neural model.
TOKENIZER_SHA256 = "37c465794d44d16554106eb9d2972c123e05fb76c300bb4bf1cc321fcb363f7b"

EDGE_CASES = [
    "",
    " ",
    "\n",
    "  \n\n  \t ",
    "a",
    "The cat sat on the mat because it was tired.",
    "Once upon a time, there was a little girl named Lily.",
    "supercalifragilisticexpialidocious",
    "Pneumonoultramicroscopicsilicovolcanoconiosis and antidisestablishmentarianism",
    "a" * 300,
    "ab" * 150,
    "xyzzyqwfp" * 20,
    "hello" + "!" * 64,
    "It's I'm we're they've he'll she'd don't IT'S I'M",
    "'s 't 're 've 'm 'll 'd '",
    "trailing spaces   ",
    "   leading spaces",
    "tabs\tand\ttabs",
    "windows\r\nnewlines\r\n",
    "non\u00a0breaking\u00a0space",
    "zero\u200bwidth\u200bspace",
    "line\u2028separator",
    "\ufeffbyte order mark first, and \ufeff inside",
    "numbers 1234567890 3.14159 1,000,000 42nd",
    "Café naïve résumé coöperate façade jalapeño",
    "Ünïcödé ÀÉÎÕÜ ß ø å æ œ",
    "Straße und Grüße aus München",
    "日本語のテキストです。",
    "中文字符测试",
    "한국어 텍스트",
    "Русский текст с буквами ёЁ",
    "Ελληνικά γράμματα",
    "עברית מימין לשמאל",
    "العربية من اليمين إلى اليسار",
    "हिन्दी देवनागरी",
    "ไทย ภาษา",
    "e\u0301 combining acute, n\u0303 combining tilde",
    "🐶🐱🐭🐹🐰🦊",
    "The dog 🐶 was happy 😀!",
    "👨‍👩‍👧‍👦 family ZWJ sequence",
    "🏳️‍🌈 flag and 🇺🇸🇯🇵 regional indicators",
    "👍🏽 skin tone modifier",
    "math ∑∫√∞ ≠ ≤ ≥ ±",
    "quotes “curly” ‘single’ «guillemets» „low“",
    "dashes – — and ellipsis …",
    "symbols @#$%^&*()_+-=[]{}|;:,.<>?/~`",
    "<bos> and <eos> are plain text to encode",
    "<|endoftext|>",
    "\u0000 control \u0001 chars \u007f",
    "𝕄𝕒𝕥𝕙 𝔽𝕣𝕒𝕜𝕥𝕦𝕣 astral plane letters",
    "\U0001f600" * 20,
]


def read_stories(path: Path) -> Iterator[str]:
    text = path.read_text(encoding="utf-8")
    for story in text.split(STORY_SEPARATOR):
        if story := story.strip():
            yield story


def train(corpus: Path, vocab_size: int) -> Tokenizer:
    """Train HF byte-level BPE with the special tokens first and all 256 bytes in the base."""
    hf = Tokenizer(models.BPE())
    hf.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    hf.decoder = decoders.ByteLevel()
    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=list(SPECIAL_TOKENS.values()),
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=True,
    )
    hf.train_from_iterator(read_stories(corpus), trainer=trainer)
    return hf


def to_minimal(hf: Tokenizer, vocab_size: int) -> dict[str, Any]:
    """Our format for the first `vocab_size` entries of a trained HF tokenizer."""
    model = json.loads(hf.to_str())["model"]
    ordered = sorted(model["vocab"].items(), key=lambda item: item[1])
    assert [i for _, i in ordered] == list(range(len(ordered)))
    vocab = [token for token, _ in ordered][:vocab_size]
    index = {token: i for i, token in enumerate(vocab)}
    merges = [[index[left], index[right]] for left, right in model["merges"][: vocab_size - BASE_VOCAB]]
    for rank, (left, right) in enumerate(merges):
        assert index[vocab[left] + vocab[right]] == BASE_VOCAB + rank, "merge order != vocab order"
    special = {name: index[token] for name, token in SPECIAL_TOKENS.items()}
    return {"vocab": vocab, "merges": merges, "special": special}


def from_minimal(data: dict[str, Any]) -> Tokenizer:
    """An HF tokenizer built from our format: the reference the TypeScript runtime must match."""
    vocab = {token: i for i, token in enumerate(data["vocab"])}
    merges = [(data["vocab"][left], data["vocab"][right]) for left, right in data["merges"]]
    hf = Tokenizer(models.BPE(vocab=vocab, merges=merges))
    hf.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    hf.decoder = decoders.ByteLevel()
    return hf


def encode(hf: Tokenizer, text: str) -> list[int]:
    """HF's pre-tokenizer and BPE model, without special-token parsing (like the runtime)."""
    return [
        token.id
        for piece, _ in hf.pre_tokenizer.pre_tokenize_str(text)
        for token in hf.model.tokenize(piece)
    ]


def single_piece_fraction(hf: Tokenizer, words: list[str]) -> float:
    return sum(len(hf.model.tokenize(word)) == 1 for word in words) / len(words)


def choose_vocab_size(full: dict[str, Any], words: list[str]) -> tuple[int, dict[int, float]]:
    """The smallest candidate size where enough of the common words are one piece."""
    measured = {
        size: single_piece_fraction(from_minimal(truncate(full, size)), words)
        for size in CANDIDATE_SIZES
    }
    passing = [size for size, fraction in measured.items() if fraction >= SINGLE_PIECE_TARGET]
    return (min(passing) if passing else max(CANDIDATE_SIZES)), measured


def truncate(full: dict[str, Any], vocab_size: int) -> dict[str, Any]:
    return {
        "vocab": full["vocab"][:vocab_size],
        "merges": full["merges"][: vocab_size - BASE_VOCAB],
        "special": full["special"],
    }


def serialize(data: dict[str, Any]) -> bytes:
    return (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def parity_cases(hf: Tokenizer, lines: list[str]) -> list[dict[str, Any]]:
    sampled = random.Random(SEED).sample(lines, PARITY_STRINGS - len(EDGE_CASES))
    return [{"text": text, "ids": encode(hf, text)} for text in [*EDGE_CASES, *sampled]]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=TRAIN_FILE)
    parser.add_argument("--valid", type=Path, default=VALID_FILE)
    args = parser.parse_args()

    trained = train(args.corpus, max(CANDIDATE_SIZES))
    full = to_minimal(trained, max(CANDIDATE_SIZES))
    valid_text = args.valid.read_text(encoding="utf-8").replace(STORY_SEPARATOR, "")
    lines = [line for line in valid_text.splitlines() if line.strip()]
    common = tokenizer_probes.count_words(trained, lines).most_common(COMMON_WORDS)
    words = [word for word, _ in common]
    vocab_size, measured = choose_vocab_size(full, words)
    for size, fraction in measured.items():
        print(f"vocab {size}: {fraction:.3f} of the {COMMON_WORDS} most common words are one piece")
    print(f"chosen vocab size: {vocab_size}")

    data = truncate(full, vocab_size)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TOKENIZER_FILE.write_bytes(serialize(data))
    sha256 = hashlib.sha256(TOKENIZER_FILE.read_bytes()).hexdigest()
    print(f"tokenizer sha256: {sha256}")
    if sha256 != TOKENIZER_SHA256:
        print("warning: this differs from the frozen TOKENIZER_SHA256")

    reference = from_minimal(data)
    PARITY_FILE.write_text(json.dumps(parity_cases(reference, lines), ensure_ascii=False) + "\n")
    evidence = tokenizer_probes.run(reference, lines, sha256)
    EVIDENCE_FILE.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    for result in evidence["evidence"]:
        print(result)
    print("prompts:", evidence["prompts"])


if __name__ == "__main__":
    main()
