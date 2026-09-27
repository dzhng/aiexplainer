"""TinyStories as token streams for training (gitignored, under `data/`).

Each story becomes `<bos> tokens <eos>` in the frozen shared tokenizer, and the stories
are concatenated into one little-endian uint16 file per split (the vocabulary is 4096).

    uv run python data.py      # writes data/tokens-{train,valid}.u16 once
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import numpy as np

import tokenizer

TOKENS = {
    "train": tokenizer.DATA_DIR / "tokens-train.u16",
    "valid": tokenizer.DATA_DIR / "tokens-valid.u16",
}
SOURCES = {"train": tokenizer.TRAIN_FILE, "valid": tokenizer.VALID_FILE}
BATCH_STORIES = 20_000


def shared_tokenizer():
    """HF's fast tokenizer rebuilt from our frozen file (same encoding as the runtime)."""
    return tokenizer.from_minimal(json.loads(tokenizer.TOKENIZER_FILE.read_text()))


def story_batches(path: Path) -> Iterator[list[str]]:
    batch: list[str] = []
    for story in tokenizer.read_stories(path):
        batch.append(story)
        if len(batch) == BATCH_STORIES:
            yield batch
            batch = []
    if batch:
        yield batch


def encode_stories(stories: list[str], hf=None) -> np.ndarray:
    """`<bos> story <eos>` for each story, concatenated."""
    hf = hf or shared_tokenizer()
    special = json.loads(tokenizer.TOKENIZER_FILE.read_text())["special"]
    parts = []
    for encoding in hf.encode_batch(stories, add_special_tokens=False):
        parts.append(np.array([special["bos"], *encoding.ids, special["eos"]], dtype=np.uint16))
    return np.concatenate(parts)


def write_split(split: str) -> int:
    hf = shared_tokenizer()
    total = 0
    with TOKENS[split].open("wb") as out:
        for stories in story_batches(SOURCES[split]):
            tokens = encode_stories(stories, hf)
            out.write(tokens.astype("<u2").tobytes())
            total += len(tokens)
    return total


def load_tokens(split: str) -> np.ndarray:
    return np.memmap(TOKENS[split], dtype="<u2", mode="r")


def main() -> None:
    for split in ("valid", "train"):
        print(f"{split}: {write_split(split):,} tokens → {TOKENS[split]}")


if __name__ == "__main__":
    main()
