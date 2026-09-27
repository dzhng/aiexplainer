"""Which probes each trained model gets: `run_probes` returns the manifest's `evidence`
and the `scenarios.json` prompts (O2), keyed by probe."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from model import Transformer
from probes import attention, embed, order

Evidence = list[dict[str, Any]]


def run_probes(model_id: str, model: Transformer, model_dir: Path) -> tuple[Evidence, dict[str, list[str]]]:
    evidence: Evidence = []
    scenarios: dict[str, list[str]] = {}

    def add(name: str, measured: tuple[Evidence, list[str]]) -> None:
        evidence.extend(measured[0])
        scenarios[name] = measured[1]

    if model_id == "embed":
        add("neighbours", embed.neighbours(model))
        add("sampling", embed.sampling(model))
    if model_id == "attn":
        add("attention", attention.attention(model))
    if model_id in ("attn", "rope"):
        add("order", order.order(model_id, model_dir))
    if not evidence:
        raise ValueError(f"no probes for model {model_id!r} (D25: every model is probed)")
    return evidence, scenarios
