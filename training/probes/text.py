"""Prompt text to model tokens, exactly as the runtime's `promptTokens` does it."""

from __future__ import annotations

import json
from functools import cache

import tokenizer


@cache
def _reference():
    data = json.loads(tokenizer.TOKENIZER_FILE.read_text())
    return tokenizer.from_minimal(data), data


def prompt_tokens(text: str) -> list[int]:
    """`<bos>` then the text's tokens (packages/llm `promptTokens`)."""
    hf, data = _reference()
    return [data["special"]["bos"], *tokenizer.encode(hf, text)]


def encode(text: str) -> list[int]:
    return tokenizer.encode(_reference()[0], text)


def decode(ids: list[int]) -> str:
    return _reference()[0].decode(ids)


def vocab() -> list[str]:
    return _reference()[1]["vocab"]


def single_token(word: str) -> int | None:
    """The id of `word` as it appears mid-sentence (after a space), if it is one token."""
    ids = encode(" " + word)
    return ids[0] if len(ids) == 1 else None
