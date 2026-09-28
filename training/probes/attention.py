"""Chapter 4 probes: does a word attend back to what it refers to?

Two curated validation sets, each prompt ending on a focus token with an earlier
referent (a named character):
- recall: the next word is the character's name again ("...named Tim. ... One sunny
  day," → "Tim");
- pronoun: the focus token is a "She"/"He" that refers to the character.
For each prompt, the attention mass from the focus token onto the name's tokens is
divided by what uniform attention would give them (their share of visible positions).
An effect passes at a mean ratio of 2. Attention weights show what a word
draws from; they are not proof of meaning (copy rules).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import torch

from model import Transformer
from probes import curate
from probes.evidence import result
from probes.text import encode, prompt_tokens

RATIO_THRESHOLD = 2.0


def referent_positions(tokens: list[int], name: str) -> list[int]:
    positions = []
    for spelling in (" " + name, name):
        ids = encode(spelling)
        for i in range(len(tokens) - len(ids)):
            if tokens[i : i + len(ids)] == ids:
                positions.extend(range(i, i + len(ids)))
    return sorted(set(positions))


def ratios(model: Transformer, prompt_set: str) -> list[tuple[float, str]]:
    rows = []
    for prompt in curate.load(prompt_set):
        tokens = prompt_tokens(prompt["text"])
        referent = referent_positions(tokens, prompt["referent"])
        trace: list[dict[str, Any]] = []
        with torch.no_grad():
            model(torch.tensor([tokens]), trace)
        # Last layer, the focus token's row, averaged over heads.
        weights = trace[-1]["attn"]["weights"][0, :, -1].mean(0).double().numpy()
        uniform = len(referent) / len(tokens)
        rows.append((float(weights[referent].sum()) / uniform, prompt["text"]))
    return sorted(rows, key=lambda row: -row[0])


def attention(model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    evidence = []
    for probe, prompt_set in (("recall-attention", "recall"), ("pronoun-attention", "pronoun")):
        rows = ratios(model, prompt_set)
        mean = float(np.mean([r for r, _ in rows]))
        metric = f"mean attention on the referent ÷ uniform ({len(rows)} prompts)"
        evidence.append(result(probe, "", metric, mean, RATIO_THRESHOLD))
        evidence.append(result(probe, rows[0][1], "attention on the referent ÷ uniform", rows[0][0], RATIO_THRESHOLD))
        if prompt_set == "recall":
            scenarios = [text for _, text in rows[:3]]
    return evidence, scenarios
