"""Chapter 13 probe: how often `full` accepts a drafter's guesses.

With the Leviathan rule a guess drawn from the drafter's q is kept with probability
min(1, p/q), so at one position the acceptance probability is β = Σₓ min(p(x), q(x)).
α is β averaged over validation positions (Leviathan et al. 2023, §3.1), at
temperature 1. With k = 4 guesses per round, a target pass yields (1 − α⁵)/(1 − α)
tokens on average, and the expected speedup is that divided by (c·k + 1), where c is
the drafter's cost relative to the target (here: their ratio of weight parameters).
"""

from __future__ import annotations

from typing import Any

from model import Transformer
from probes.common import next_token_probs, shipped, validation_windows
from probes.evidence import result

K = 4
ALPHA_THRESHOLD = 0.5
SPEEDUP_THRESHOLD = 1.0


def parameters(model: Transformer) -> int:
    return sum(p.numel() for p in model.parameters())


def drafter(model_id: str, model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    target = shipped("full")
    tokens = validation_windows(20, 128)
    p, q = next_token_probs(target, tokens), next_token_probs(model, tokens)
    alpha = float(p.minimum(q).sum(-1).mean())
    per_pass = (1 - alpha ** (K + 1)) / (1 - alpha)
    cost = parameters(model) / parameters(target)
    speedup = per_pass / (cost * K + 1)
    evidence = [
        result("draft-acceptance", "", f"α: mean acceptance probability of a guess by {model_id} for full", alpha, ALPHA_THRESHOLD),
        result("draft-speedup", "", f"expected speedup with k={K} (cost ratio {cost:.3f})", speedup, SPEEDUP_THRESHOLD),
    ]
    return evidence, ["Once upon a time, there was a little"]
