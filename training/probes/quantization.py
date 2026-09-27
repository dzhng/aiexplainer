"""Chapter 12 probe: what 8-bit weights cost.

`full-q8` against `full` on validation windows (every position): how often the top
next token agrees, the mean KL divergence KL(full ‖ q8) in nats, and the byte ratio of
the two weights files.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch

import export
from model import load_exported
from probes import curate
from probes.common import next_token_probs, validation_windows
from probes.evidence import result
from probes.text import prompt_tokens

AGREEMENT_THRESHOLD = 0.9
KL_THRESHOLD = 0.05
BYTE_RATIO_THRESHOLD = 0.6


def quantization(full_dir: Path, q8_dir: Path) -> tuple[list[dict[str, Any]], list[str]]:
    _, full = load_exported(full_dir)
    _, q8 = load_exported(q8_dir)
    tokens = validation_windows(20, 128)
    p, q = next_token_probs(full, tokens), next_token_probs(q8, tokens)
    agreement = float((p.argmax(-1) == q.argmax(-1)).double().mean())
    kl = float((p * (p.clamp_min(1e-30).log() - q.clamp_min(1e-30).log())).sum(-1).mean())
    size = lambda d: (d / export.WEIGHTS_FILE).stat().st_size  # noqa: E731
    ratio = size(q8_dir) / size(full_dir)

    per_prompt = []
    for text in curate.load("sampling"):
        t = torch.tensor([prompt_tokens(text)])
        pp, qq = next_token_probs(full, t)[0, -1], next_token_probs(q8, t)[0, -1]
        per_prompt.append((float((pp * (pp.log() - qq.log())).sum()), text))
    per_prompt.sort()
    evidence = [
        result("q8-agreement", "", "share of validation positions where the top next token matches full", agreement, AGREEMENT_THRESHOLD),
        result("q8-kl", "", "mean KL(full ‖ full-q8), nats", kl, KL_THRESHOLD, at_most=True),
        result("q8-bytes", "", "weights.bin bytes, full-q8 ÷ full", ratio, BYTE_RATIO_THRESHOLD, at_most=True),
    ]
    # The prompts where the two agree most and least closely.
    return evidence, [per_prompt[0][1], per_prompt[-1][1]]
