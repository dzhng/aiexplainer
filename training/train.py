"""Train one model of the ladder from its config, probe it and export it.

    uv run python train.py --config configs/attn.toml

A config has the model `id`, an `[arch]` table (the `Arch` fields; `vocab` comes from
the frozen tokenizer) and a `[train]` table (`TrainConfig`). Training runs on MPS with
a fixed seed, AdamW and a linear-warmup cosine learning-rate decay. Batches are random
windows of the tokenized train split (`data.py`), restricted to its first
`train_tokens` tokens. The manifest records val loss, wall time and tokens seen.
"""

from __future__ import annotations

import argparse
import json
import math
import time
import tomllib
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn.functional as F

import data
import export
from model import Arch, Mlp, Transformer, load_exported
from probes.models import run_probes

TRAINING_DIR = Path(__file__).resolve().parent
MODELS_DIR = TRAINING_DIR.parent / "apps/explainer/public/models"
TRAINED_FIXTURES_DIR = TRAINING_DIR / "fixtures/trained"
VOCAB = 4096
PARITY_PROMPTS = 20
PARITY_PROMPT_TOKENS = 48
PARITY_LOGIT_STRIDE = 16


@dataclass(frozen=True)
class TrainConfig:
    seed: int = 0
    steps: int = 2000
    batch_size: int = 64
    lr: float = 3e-3
    min_lr_ratio: float = 0.1
    warmup: int = 100
    weight_decay: float = 0.1
    train_tokens: int = 50_000_000
    eval_every: int = 250
    eval_batches: int = 20
    device: str = "mps"


@dataclass(frozen=True)
class Config:
    id: str
    arch: Arch
    train: TrainConfig

    @staticmethod
    def load(path: Path) -> Config:
        raw = tomllib.loads(path.read_text())
        arch = dict(raw["arch"])
        mlp = arch.pop("mlp", "none")
        arch["mlp"] = Mlp() if mlp == "none" else Mlp(**mlp)
        return Config(raw["id"], Arch(vocab=VOCAB, **arch), TrainConfig(**raw.get("train", {})))


@dataclass
class TrainResult:
    model: Transformer
    losses: list[float]
    val_losses: list[tuple[int, float]] = field(default_factory=list)
    wall_seconds: float = 0.0
    tokens_seen: int = 0
    seconds_per_1k_steps: float = 0.0


def lr_at(step: int, cfg: TrainConfig) -> float:
    if step < cfg.warmup:
        return cfg.lr * (step + 1) / cfg.warmup
    progress = (step - cfg.warmup) / max(1, cfg.steps - cfg.warmup)
    floor = cfg.lr * cfg.min_lr_ratio
    return floor + (cfg.lr - floor) * 0.5 * (1 + math.cos(math.pi * progress))


def windows(tokens: np.ndarray, offsets: np.ndarray, ctx: int, device: str) -> tuple[torch.Tensor, torch.Tensor]:
    """Inputs and next-token targets for windows starting at `offsets`."""
    rows = np.stack([tokens[o : o + ctx + 1] for o in offsets]).astype(np.int64)
    batch = torch.from_numpy(rows).to(device)
    return batch[:, :-1], batch[:, 1:]


def aux_loss(model: Transformer) -> torch.Tensor | float:
    """Extra training losses the arch asks for (the MoE balance loss, slice 17)."""
    return 0.0


@torch.no_grad()
def evaluate(model: Transformer, tokens: np.ndarray, cfg: TrainConfig, ctx: int) -> float:
    """Mean next-token loss on fixed windows of `tokens` (the same windows every call)."""
    model.eval()
    rng = np.random.default_rng(12345)
    losses = []
    for _ in range(cfg.eval_batches):
        offsets = rng.integers(0, len(tokens) - ctx - 1, size=cfg.batch_size)
        x, y = windows(tokens, offsets, ctx, cfg.device)
        logits = model(x)
        losses.append(F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1)).item())
    model.train()
    return float(np.mean(losses))


def train(
    arch: Arch,
    cfg: TrainConfig,
    train_tokens: np.ndarray,
    valid_tokens: np.ndarray,
    log: Callable[[str], None] = print,
) -> TrainResult:
    torch.manual_seed(cfg.seed)
    model = Transformer(arch).to(cfg.device)
    decay = [p for p in model.parameters() if p.dim() >= 2]
    no_decay = [p for p in model.parameters() if p.dim() < 2]
    optimizer = torch.optim.AdamW(
        [{"params": decay, "weight_decay": cfg.weight_decay}, {"params": no_decay, "weight_decay": 0.0}],
        lr=cfg.lr,
        betas=(0.9, 0.95),
    )
    stream = train_tokens[: cfg.train_tokens]
    rng = np.random.default_rng(cfg.seed)
    result = TrainResult(model, [])
    start = time.monotonic()
    for step in range(cfg.steps):
        for group in optimizer.param_groups:
            group["lr"] = lr_at(step, cfg)
        offsets = rng.integers(0, len(stream) - arch.ctx - 1, size=cfg.batch_size)
        x, y = windows(stream, offsets, arch.ctx, cfg.device)
        logits = model(x)
        loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1)) + aux_loss(model)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        result.losses.append(loss.item())
        if (step + 1) % cfg.eval_every == 0 or step + 1 == cfg.steps:
            val = evaluate(model, valid_tokens, cfg, arch.ctx)
            result.val_losses.append((step + 1, val))
            log(f"step {step + 1:5d}  loss {result.losses[-1]:.4f}  val {val:.4f}  {time.monotonic() - start:.0f}s")
    if cfg.device == "mps":
        torch.mps.synchronize()
    result.wall_seconds = time.monotonic() - start
    result.tokens_seen = cfg.steps * cfg.batch_size * arch.ctx
    result.seconds_per_1k_steps = result.wall_seconds / cfg.steps * 1000
    return result


def parity_fixture(model: Transformer, valid_tokens: np.ndarray, seed: int) -> dict[str, Any]:
    """Torch logits for 20 validation prompts, at every `PARITY_LOGIT_STRIDE`-th vocab entry
    plus the top 8, for the TypeScript trained-model parity test."""
    rng = np.random.default_rng(seed)
    bos = 0
    starts = np.flatnonzero(valid_tokens[: len(valid_tokens) - PARITY_PROMPT_TOKENS] == bos)
    prompts = []
    for start in rng.choice(starts, size=PARITY_PROMPTS, replace=False):
        length = int(rng.integers(4, PARITY_PROMPT_TOKENS))
        tokens = [int(t) for t in valid_tokens[start : start + length]]
        with torch.no_grad():
            logits = model(torch.tensor([tokens]))[0, -1]
        top = torch.topk(logits, 8).indices.tolist()
        indices = sorted(set(range(0, len(logits), PARITY_LOGIT_STRIDE)) | set(top))
        prompts.append({"tokens": tokens, "indices": indices, "logits": [float(f"{logits[i].item():.9g}") for i in indices]})
    return {"prompts": prompts}


def probe(model_id: str) -> list[dict[str, Any]]:
    """Probe the exported (f16) model, so evidence describes what ships; write its
    evidence and scenarios."""
    out_dir = MODELS_DIR / model_id
    _, shipped = load_exported(out_dir)
    evidence, scenarios = run_probes(model_id, shipped, out_dir)
    export.write_evidence(out_dir, evidence)
    (out_dir / "scenarios.json").write_text(json.dumps(scenarios, indent=2) + "\n")
    return evidence


def run(config_path: Path) -> None:
    config = Config.load(config_path)
    train_tokens, valid_tokens = data.load_tokens("train"), data.load_tokens("valid")
    print(f"{config.id}: {config.arch}")
    result = train(config.arch, config.train, train_tokens, valid_tokens)
    out_dir = MODELS_DIR / config.id
    val_loss = result.val_losses[-1][1]
    model = result.model.cpu().eval()

    export.export_model(
        out_dir,
        model_id=config.id,
        kind="transformer",
        tokenizer=export.bpe_tokenizer_ref(out_dir),
        tensors=model.export_tensors(),
        training=export.training_record(
            seed=config.train.seed,
            steps=config.train.steps,
            tokens_seen=result.tokens_seen,
            wall_seconds=result.wall_seconds,
            val_loss=val_loss,
        ),
        evidence=[],  # filled by `probe`, which measures the exported f16 weights
        arch=config.arch.to_json(),
    )
    evidence = probe(config.id)
    _, shipped = load_exported(out_dir)
    TRAINED_FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    fixture = parity_fixture(shipped, valid_tokens, config.train.seed)
    (TRAINED_FIXTURES_DIR / f"{config.id}.json").write_text(json.dumps(fixture) + "\n")
    summary = {
        "id": config.id,
        "valLoss": val_loss,
        "wallSeconds": round(result.wall_seconds, 1),
        "secondsPer1kSteps": round(result.seconds_per_1k_steps, 1),
        "tokensSeen": result.tokens_seen,
        "weightsBytes": (out_dir / export.WEIGHTS_FILE).stat().st_size,
        "evidence": evidence,
    }
    print(json.dumps(summary, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--probe-only", action="store_true", help="re-probe the exported model")
    args = parser.parse_args()
    if args.probe_only:
        print(json.dumps(probe(Config.load(args.config).id), indent=2))
    else:
        run(args.config)


if __name__ == "__main__":
    main()
