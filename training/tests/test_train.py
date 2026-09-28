import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

import train
from model import Arch, Mlp
from paths import MODELS_DIR, TRAINING_DIR
from schemas import validate

# The first single-effect models are budgeted at 4 MB each; the whole ladder has its own
# budget (a bun test, `shipped-models.test.ts`).
FOUR_MB_MODELS = {"embed", "attn", "rope"}
CONFIGS = sorted((TRAINING_DIR / "configs").glob("*.toml"))
TINY = Arch(d_model=32, n_layers=1, n_heads=2, n_kv_heads=1, ctx=32, vocab=4096, mlp=Mlp("swiglu", 64))


def tokens(seed: int, n: int) -> np.ndarray:
    """A learnable stream: every second token is a fixed function of the one before."""
    rng = np.random.default_rng(seed)
    out = rng.integers(0, 4096, size=n)
    out[1::2] = (out[0::2] * 7 + 3) % 4096
    return out.astype(np.uint16)


def first_100_losses(device: str) -> list[float]:
    cfg = train.TrainConfig(
        steps=100, batch_size=8, lr=1e-3, train_tokens=20_000, eval_every=100, eval_batches=2, device=device
    )
    return train.train(TINY, cfg, tokens(0, 20_000), tokens(1, 5_000), log=lambda _: None).losses


def losses_in_fresh_process(device: str) -> list[float]:
    code = (
        "import json, sys; sys.path[:0] = ['.', 'tests']; import test_train as t; "
        f"print(json.dumps(t.first_100_losses({device!r})))"
    )
    run = subprocess.run([sys.executable, "-c", code], cwd=TRAINING_DIR, capture_output=True, text=True, check=True)
    return json.loads(run.stdout)


def test_same_seed_gives_the_same_first_100_step_losses_on_cpu():
    runs = [losses_in_fresh_process("cpu") for _ in range(2)]
    assert runs[0] == runs[1]
    assert runs[0][-1] < runs[0][0]  # it learns


def test_same_seed_on_mps_agrees_to_float_rounding():
    """MPS kernels are not bit-reproducible across processes (measured: runs differ in the
    last bit of a float32 loss after ~30-90 steps), so MPS runs agree within 1e-5."""
    runs = [losses_in_fresh_process("mps") for _ in range(2)]
    assert max(abs(a - b) for a, b in zip(*runs, strict=True)) < 1e-5
    assert runs[0][-1] < runs[0][0]  # it learns


def test_learning_rate_warms_up_then_decays_to_the_floor():
    cfg = train.TrainConfig(steps=1000, warmup=100, lr=1e-3, min_lr_ratio=0.1)
    assert train.lr_at(0, cfg) == pytest.approx(1e-5)
    assert train.lr_at(99, cfg) == pytest.approx(1e-3)
    assert train.lr_at(999, cfg) == pytest.approx(1e-4, rel=1e-3)


@pytest.mark.parametrize("path", CONFIGS, ids=lambda p: p.stem)
def test_every_config_loads(path: Path):
    assert train.Config.load(path).id == path.stem


@pytest.mark.parametrize("path", CONFIGS, ids=lambda p: p.stem)
def test_every_trained_model_exports_a_valid_manifest_and_scenarios(path: Path):
    model_dir = MODELS_DIR / path.stem
    manifest = json.loads((model_dir / "manifest.json").read_text())
    validate(manifest, "manifest.schema.json")
    validate(json.loads((model_dir / "scenarios.json").read_text()), "scenarios.schema.json")
    assert manifest["evidence"], "D25"
    if path.stem in FOUR_MB_MODELS:
        assert (model_dir / "weights.bin").stat().st_size <= 4 * 1024 * 1024, "4 MB size budget"
    assert (train.TRAINED_FIXTURES_DIR / f"{path.stem}.json").exists()
