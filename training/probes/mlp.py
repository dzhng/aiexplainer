"""Chapter 6 probe: how much of the right answer comes from the MLP?

On curated fact-like prompts ("The sky is" → "blue"), the probability of the answer is
measured with the model as trained, with its most active MLP neurons switched off (the
top `TOP_NEURONS` by |activation| at the last position, per prompt), and with the whole
MLP switched off. The drop is relative and weighted by how much probability the model
gave the answer (1 − Σ p_off / Σ p): a plain mean of per-prompt relative drops is
dominated by prompts where the tiny model never knew the answer (p ≈ 0.001), whose
"relative change" is noise. The effect passes at a 30% drop with the top neurons off.
The copy says "a lot of what the model knows is stored here", never "facts
live here".
"""

from __future__ import annotations

from typing import Any

import torch

from model import Transformer
from probes import curate
from probes.evidence import result
from probes.text import prompt_tokens, single_token

TOP_NEURONS = 16
DROP_THRESHOLD = 0.3


@torch.no_grad()
def answer_probability(model: Transformer, tokens: list[int], answer: int, silence=None) -> tuple[float, torch.Tensor]:
    """p(answer) after `tokens`, with `silence(act)` editing the MLP's hidden activations."""
    mlp = model.layers[0].mlp
    captured: dict[str, torch.Tensor] = {}

    def hook(_module, inputs):
        (act,) = inputs
        captured["act"] = act.detach().clone()
        return (silence(act),) if silence else None

    handle = mlp.w2.register_forward_pre_hook(hook)
    try:
        probs = model(torch.tensor([tokens]))[0, -1].double().softmax(-1)
    finally:
        handle.remove()
    return float(probs[answer]), captured["act"][0, -1]


def mlp(model: Transformer) -> tuple[list[dict[str, Any]], list[str]]:
    rows = []
    for text, word in curate.load("facts"):
        answer = single_token(word)
        if answer is None:
            continue
        tokens = prompt_tokens(text)
        p, act = answer_probability(model, tokens, answer)
        top = act.abs().topk(TOP_NEURONS).indices

        def without_top(a: torch.Tensor) -> torch.Tensor:
            a = a.clone()
            a[..., top] = 0
            return a

        p_neurons, _ = answer_probability(model, tokens, answer, without_top)
        p_none, _ = answer_probability(model, tokens, answer, torch.zeros_like)
        rows.append({"text": f"{text} … {word}", "p": p, "neurons": p_neurons, "mlp": p_none, "top": top.tolist()[:4]})
    total = sum(r["p"] for r in rows)
    neurons = 1 - sum(r["neurons"] for r in rows) / total
    whole = 1 - sum(r["mlp"] for r in rows) / total
    known = sum(r["p"] >= 0.1 for r in rows)
    rows.sort(key=lambda r: -(r["p"] - r["neurons"]))
    best = rows[0]
    evidence = [
        result("mlp-neurons", "", f"drop in total p(answer) with the top {TOP_NEURONS} neurons off ({len(rows)} prompts)", neurons, DROP_THRESHOLD),
        result("mlp-whole", "", f"drop in total p(answer) with the whole MLP off ({len(rows)} prompts)", whole, DROP_THRESHOLD),
        result("mlp-known", "", "prompts where the model gives the answer p ≥ 0.1", known, 1),
        result("mlp-neurons", best["text"], f"p(answer) {best['p']:.3f} → {best['neurons']:.3f} with the top {TOP_NEURONS} neurons off", 1 - best["neurons"] / best["p"], DROP_THRESHOLD),
    ]
    scenarios = [f"{r['text']} (top neurons {', '.join(map(str, r['top']))})" for r in rows[:3]]
    return evidence, scenarios
