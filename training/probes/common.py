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


def validation_windows(count: int, length: int, seed: int = 17) -> torch.Tensor:
    """`[count, length]` fixed windows of the tokenized validation split, each from a story start."""
    tokens = data.load_tokens("valid")
    starts = np.flatnonzero(tokens[: len(tokens) - length] == 0)  # <bos>
    chosen = np.random.default_rng(seed).choice(starts, size=count, replace=False)
    return torch.from_numpy(np.stack([tokens[s : s + length] for s in chosen]).astype(np.int64))


@torch.no_grad()
def next_token_probs(model: Transformer, tokens: torch.Tensor) -> torch.Tensor:
    """`[batch, positions, vocab]` float64 next-token probabilities at temperature 1."""
    return model(tokens).double().softmax(-1)
