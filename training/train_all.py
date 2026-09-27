"""Train the given configs one after another (MPS runs one model at a time).

    uv run python train_all.py embed attn rope
    uv run python train_all.py --no-probe full drafter-64   # probe later with --probe-only
"""

import sys
from pathlib import Path

import train

CONFIGS_DIR = Path(__file__).resolve().parent / "configs"

if __name__ == "__main__":
    ids = [a for a in sys.argv[1:] if a != "--no-probe"]
    for model_id in ids:
        train.run(CONFIGS_DIR / f"{model_id}.toml", with_probes="--no-probe" not in sys.argv)
