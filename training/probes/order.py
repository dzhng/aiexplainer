"""Chapter 5 probe: does word order change the prediction?

Each curated pair holds the same tokens with two earlier words swapped and the same last
token. The total variation between the two next-token distributions is measured on the
shipped TypeScript runtime. With one attention layer and no positions it must be exactly
0 (D35); with RoPE the effect passes at a mean of 0.05.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

from probes import curate
from probes.evidence import result
from probes.runtime import next_token_probs
from probes.text import prompt_tokens

ROPE_THRESHOLD = 0.05


def total_variations(model_dir: Path) -> list[tuple[float, list[str]]]:
    pairs = curate.load("order")
    prompts = []
    for a, b in pairs:
        ta, tb = prompt_tokens(a), prompt_tokens(b)
        assert Counter(ta) == Counter(tb) and ta[-1] == tb[-1], (a, b)
        prompts += [ta, tb]
    probs = next_token_probs(model_dir, prompts)
    tv = 0.5 * np.abs(probs[0::2] - probs[1::2]).sum(axis=1)
    return [(float(v), pair) for v, pair in zip(tv, pairs, strict=True)]


def order(model_id: str, model_dir: Path) -> tuple[list[dict[str, Any]], list[str]]:
    rows = total_variations(model_dir)
    example = rows[0]  # the spec's "dog chased the cat" pair
    label = " / ".join(example[1])
    if model_id == "attn":
        worst = max(v for v, _ in rows)
        evidence = [
            result("order-invariance", "", f"largest total variation over {len(rows)} swapped pairs", worst, 0.0, at_most=True),
            result("order-invariance", label, "total variation", example[0], 0.0, at_most=True),
        ]
        return evidence, [label]
    mean = float(np.mean([v for v, _ in rows]))
    rows_by_effect = sorted(rows, key=lambda row: -row[0])
    evidence = [
        result("order-sensitivity", "", f"mean total variation over {len(rows)} swapped pairs", mean, ROPE_THRESHOLD),
        result("order-sensitivity", label, "total variation", example[0], ROPE_THRESHOLD),
    ]
    return evidence, [label] + [" / ".join(pair) for _, pair in rows_by_effect[:2]]
