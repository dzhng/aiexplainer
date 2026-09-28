"""Chapter 7 probes: the same 4 layers with and without the residual stream.

- The `residual` model's val loss must be at least 10% lower than `noresidual`'s.
- Each model's own val loss, as evidence the chapter's chips read (the chapter's model is
  `residual`, so `noresidual`'s loss has to travel in this shared evidence).
- Signal preserved (the residual-norm trace): the RMS of the stream leaving the last
  layer divided by the RMS of the token embeddings entering the first, over validation
  positions. Near 0 means the signal died on the way up.
Both manifests carry both comparisons (the chapter shows both models).
"""

from __future__ import annotations

import json
from typing import Any

import torch

from model import Transformer
from paths import MODELS_DIR
from probes.common import shipped, validation_windows
from probes.evidence import result

LOSS_RATIO_THRESHOLD = 0.9
SIGNAL_THRESHOLD = 0.5


@torch.no_grad()
def signal_ratio(model: Transformer) -> float:
    tokens = validation_windows(16, 128)
    trace: list[dict[str, Any]] = []
    model(tokens, trace)
    rms = lambda x: float(x.double().pow(2).mean().sqrt())  # noqa: E731
    return rms(trace[-1]["mlpResidual"]["sum"]) / rms(model.tok_emb(tokens))


def val_loss(model_id: str) -> float:
    return json.loads((MODELS_DIR / model_id / "manifest.json").read_text())["training"]["valLoss"]


def residual() -> tuple[list[dict[str, Any]], list[str]]:
    ratio = val_loss("residual") / val_loss("noresidual")
    evidence = [
        result("residual-loss", "", "val loss of residual ÷ noresidual", ratio, LOSS_RATIO_THRESHOLD, at_most=True),
    ]
    for model_id in ("residual", "noresidual"):
        # Informational: the pass/fail lives in `residual-loss`; uniform guessing is ln 4096.
        evidence.append(result(f"val-loss-{model_id}", "", f"validation loss of {model_id} (nats per token)", val_loss(model_id), 0.0))
    for model_id in ("residual", "noresidual"):
        signal = signal_ratio(shipped(model_id))
        evidence.append(result(f"signal-preserved-{model_id}", "", "RMS of the last layer's stream ÷ RMS of the embeddings", signal, SIGNAL_THRESHOLD))
    return evidence, ["Once upon a time, there was a little"]
