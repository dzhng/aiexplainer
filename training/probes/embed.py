"""Chapters 2 and 3 probes on the `embed` model.

- neighbours (ch 2): for each curated word pair (a, b), the share of 500 random words
  that are further from `a` than `b` is (cosine similarity of input embeddings). Chance
  is 0.5; the effect passes at a mean of 0.9.
- sampling (ch 3): how peaked the next-token guess is after common contexts (mean top-1
  probability), and whether raising the temperature raises its entropy on every prompt.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import torch

from model import Transformer
from probes import curate
from probes.evidence import result
from probes.text import prompt_tokens, single_token, vocab

RANDOM_WORDS = 500
NEIGHBOUR_THRESHOLD = 0.9
PEAKED_THRESHOLD = 0.2
TEMPERATURES = (0.5, 1.0, 1.5)
SEED = 2


def neighbours(model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    emb = model.tok_emb.weight.detach().double().numpy()
    unit = emb / np.linalg.norm(emb, axis=1, keepdims=True)
    words = [t for t in vocab() if t.startswith("Ġ") and t[1:].isascii() and t[1:].isalpha()]
    rng = np.random.default_rng(SEED)
    randoms = [single_token(w[1:]) for w in rng.choice(words, RANDOM_WORDS, replace=False)]
    ranks = []
    for a, b in curate.load("neighbours"):
        ia, ib = single_token(a), single_token(b)
        if ia is None or ib is None:
            continue
        close = unit[ia] @ unit[ib]
        others = unit[[r for r in randoms if r not in (ia, ib)]] @ unit[ia]
        ranks.append((float((others < close).mean()), f"{a} {b}"))
    mean = float(np.mean([r for r, _ in ranks]))
    ranks.sort(reverse=True)
    evidence = [
        result(
            "neighbours",
            "",
            f"share of random words further than the paired word ({len(ranks)} pairs)",
            mean,
            NEIGHBOUR_THRESHOLD,
        ),
        result("neighbours", ranks[0][1], "share of random words further", ranks[0][0], NEIGHBOUR_THRESHOLD),
    ]
    return evidence, [pair for _, pair in ranks[:5]]


def entropy_bits(p: np.ndarray) -> float:
    p = p[p > 0]
    return float(-(p * np.log2(p)).sum())


def sampling(model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    rows = []
    for text in curate.load("sampling"):
        with torch.no_grad():
            logits = model(torch.tensor([prompt_tokens(text)]))[0, -1].double()
        entropies = [entropy_bits((logits / t).softmax(-1).numpy()) for t in TEMPERATURES]
        top1 = float(logits.softmax(-1).max())
        rows.append((top1, text, entropies))
    rising = np.mean([e[0] < e[1] < e[2] for _, _, e in rows])
    rows.sort(key=lambda row: -row[0])
    best = rows[0]
    evidence = [
        result("sampling-peaked", "", "mean top-1 probability after common contexts", np.mean([r[0] for r in rows]), PEAKED_THRESHOLD),
        result("sampling-peaked", best[1], "top-1 probability", best[0], PEAKED_THRESHOLD),
        result("temperature-entropy", "", "share of prompts whose entropy rises with temperature 0.5→1→1.5", rising, 1.0),
        result("temperature-entropy", best[1], "entropy at temperature 1.5 minus 0.5 (bits)", best[2][2] - best[2][0], 0.0),
    ]
    return evidence, [row[1] for row in rows[:3]] + [rows[-1][1]]
