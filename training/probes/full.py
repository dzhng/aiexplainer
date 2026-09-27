"""Chapter 8 probes on `full`.

- Coherent continuation: val loss at most `VAL_LOSS_THRESHOLD`, plus 20 sampled
  continuations committed in scenarios.json as the evidence text.
- Heads differ: for each layer, the mean total variation between two heads' attention
  rows (the same query token), over validation windows and every pair of heads.
"""

from __future__ import annotations

import itertools
import json
from typing import Any

import numpy as np
import torch

from model import Transformer
from probes import curate
from paths import MODELS_DIR
from probes.common import validation_windows
from probes.evidence import result
from probes.text import decode, prompt_tokens

VAL_LOSS_THRESHOLD = 2.3
HEAD_DISTANCE_THRESHOLD = 0.2
CONTINUATIONS = 20
NEW_TOKENS = 40
TEMPERATURE = 0.8


@torch.no_grad()
def continue_text(model: Transformer, text: str, generator: torch.Generator) -> str:
    tokens = prompt_tokens(text)
    for _ in range(NEW_TOKENS):
        logits = model(torch.tensor([tokens[-model.arch.ctx :]]))[0, -1]
        token = int(torch.multinomial((logits / TEMPERATURE).softmax(-1), 1, generator=generator))
        if token == 1:  # <eos>
            break
        tokens.append(token)
    return text + decode(tokens[len(prompt_tokens(text)) :])


@torch.no_grad()
def head_distance(model: Transformer) -> float:
    tokens = validation_windows(8, 96)
    trace: list[dict[str, Any]] = []
    model(tokens, trace)
    distances = []
    for layer in trace:
        weights = layer["attn"]["weights"].double()  # [batch, heads, T, T]
        for a, b in itertools.combinations(range(weights.shape[1]), 2):
            distances.append(float(0.5 * (weights[:, a] - weights[:, b]).abs().sum(-1).mean()))
    return float(np.mean(distances))


def full(model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    loss = json.loads((MODELS_DIR / "full" / "manifest.json").read_text())["training"]["valLoss"]
    generator = torch.Generator().manual_seed(8)
    prompts = curate.load("sampling")[:CONTINUATIONS]
    continuations = [continue_text(model, text, generator) for text in prompts]
    evidence = [
        result("val-loss", "", "validation loss (nats per token)", loss, VAL_LOSS_THRESHOLD, at_most=True),
        result("heads-differ", "", "mean total variation between two heads' attention rows", head_distance(model), HEAD_DISTANCE_THRESHOLD),
    ]
    return evidence, continuations
