"""Chapter 14 probe on `moe`: how the router spreads tokens over experts.

Measured only (no specialisation claims): each expert's share of routing slots on
held-out tokens, the usage entropy as a share of log(experts) (the export gate needs
0.9), and, per expert, what kind of token it is the first choice for (word starts,
word pieces, punctuation, other) and its most frequent tokens.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np
import torch

from model import Transformer
from probes.common import validation_windows
from probes.evidence import result
from probes.text import decode, vocab

ENTROPY_THRESHOLD = 0.9


def token_kind(piece: str) -> str:
    if piece.startswith("Ġ") and piece[1:].isalpha():
        return "word start"
    if piece.isalpha():
        return "word piece"
    if all(not c.isalnum() for c in piece.replace("Ġ", "")):
        return "punctuation or space"
    return "other"


@torch.no_grad()
def experts(model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    tokens = validation_windows(32, 256)
    model(tokens)
    n = model.arch.mlp.experts
    slots = np.zeros(n)
    first_choice: list[Counter[str]] = [Counter() for _ in range(n)]
    first_tokens: list[Counter[int]] = [Counter() for _ in range(n)]
    pieces = vocab()
    flat = tokens.flatten().tolist()
    for layer in model.layers:
        _, chosen = layer.moe.last_routing
        slots += np.bincount(chosen.flatten().numpy(), minlength=n)
        for token, expert in zip(flat, chosen[..., 0].flatten().tolist(), strict=True):
            first_choice[expert][token_kind(pieces[token])] += 1
            first_tokens[expert][token] += 1
    usage = slots / slots.sum()
    entropy = float(-(usage * np.log(usage)).sum() / np.log(n))
    evidence = [
        result("expert-usage-entropy", "", "routing entropy ÷ log(experts) on held-out tokens", entropy, ENTROPY_THRESHOLD),
    ]
    descriptions = []
    for e in range(n):
        total = sum(first_choice[e].values()) or 1
        kinds = ", ".join(f"{k} {v / total:.0%}" for k, v in first_choice[e].most_common(2))
        common = " ".join(repr(decode([t])) for t, _ in first_tokens[e].most_common(5))
        descriptions.append(f"expert {e}: {usage[e]:.1%} of slots; first choice for {kinds}; e.g. {common}")
    return evidence, descriptions
