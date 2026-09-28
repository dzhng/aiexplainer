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
from probes.common import held_out_windows, next_token_probs, shipped, validation_windows
from probes.evidence import result

K = 4
# The windows the drafter was chosen on: (count, length).
CHOSEN_ON = (20, 128)
ALPHA_THRESHOLD = 0.5
SPEEDUP_THRESHOLD = 1.0


def parameters(model: Transformer) -> int:
    return sum(p.numel() for p in model.parameters())


def acceptance(target: Transformer, model: Transformer, tokens) -> tuple[float, float]:
    """α on `tokens`, and the expected speedup at k = K for this drafter's cost."""
    p, q = next_token_probs(target, tokens), next_token_probs(model, tokens)
    alpha = float(p.minimum(q).sum(-1).mean())
    per_pass = (1 - alpha ** (K + 1)) / (1 - alpha)
    cost = parameters(model) / parameters(target)
    return alpha, per_pass / (cost * K + 1)


def drafter(model_id: str, model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    target = shipped("full")
    cost = parameters(model) / parameters(target)
    alpha, speedup = acceptance(target, model, validation_windows(*CHOSEN_ON))
    # O3: the drafter was chosen on those windows, so it is re-measured on
    # stories they never touched before the choice is final.
    held_alpha, held_speedup = acceptance(target, model, held_out_windows(40, 128, used=(*CHOSEN_ON, 17)))
    evidence = [
        # A measurement, not a test: the chapter's speedup chip reads it (threshold 0 always passes).
        result("draft-cost", "", f"{model_id}'s weight parameters as a fraction of full's", cost, 0.0),
        result("draft-acceptance", "", f"α: mean acceptance probability of a guess by {model_id} for full", alpha, ALPHA_THRESHOLD),
        result("draft-speedup", "", f"expected speedup with k={K} (cost ratio {cost:.3f})", speedup, SPEEDUP_THRESHOLD),
        result(
            "draft-acceptance-heldout",
            "",
            f"α of {model_id} for full on 40 held-out stories (not the ones it was chosen on)",
            held_alpha,
            ALPHA_THRESHOLD,
        ),
        result(
            "draft-speedup-heldout",
            "",
            f"expected speedup with k={K} on the held-out stories (cost ratio {cost:.3f})",
            held_speedup,
            SPEEDUP_THRESHOLD,
        ),
    ]
    return evidence, ["Once upon a time, there was a little"]
