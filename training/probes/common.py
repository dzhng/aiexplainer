"""Shared measuring helpers for the probes."""

from __future__ import annotations

import numpy as np
import torch

import data
from model import Transformer, load_exported
from paths import MODELS_DIR



def shipped(model_id: str) -> Transformer:
    """An exported model as it ships (f16, or q8_0 decoded), on the CPU."""
    return load_exported(MODELS_DIR / model_id)[1]


def _story_starts(tokens: np.ndarray, length: int) -> np.ndarray:
    return np.flatnonzero(tokens[: len(tokens) - length] == 0)  # <bos>


def validation_windows(count: int, length: int, seed: int = 17) -> torch.Tensor:
    """`[count, length]` fixed windows of the tokenized validation split, each from a story start."""
    tokens = data.load_tokens("valid")
    chosen = np.random.default_rng(seed).choice(_story_starts(tokens, length), size=count, replace=False)
    return torch.from_numpy(np.stack([tokens[s : s + length] for s in chosen]).astype(np.int64))


def held_out_windows(count: int, length: int, used: tuple[int, int, int], seed: int = 2029) -> torch.Tensor:
    """Like `validation_windows`, but from stories that `validation_windows(*used)` (count,
    length, seed) did not touch: fresh prompts for re-checking a choice made on those."""
    tokens = data.load_tokens("valid")
    starts = _story_starts(tokens, length)
    used_count, used_length, used_seed = used
    taken = np.random.default_rng(used_seed).choice(_story_starts(tokens, used_length), size=used_count, replace=False)
    fresh = starts[np.all(np.abs(starts[:, None] - taken[None, :]) >= max(length, used_length), axis=1)]
    chosen = np.random.default_rng(seed).choice(fresh, size=count, replace=False)
    return torch.from_numpy(np.stack([tokens[s : s + length] for s in chosen]).astype(np.int64))


@torch.no_grad()
def next_token_probs(model: Transformer, tokens: torch.Tensor) -> torch.Tensor:
    """`[batch, positions, vocab]` float64 next-token probabilities at temperature 1."""
    return model(tokens).double().softmax(-1)
