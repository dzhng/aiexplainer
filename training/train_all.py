"""Train the given configs one after another (MPS runs one model at a time).

    uv run python train_all.py embed attn rope
"""

import sys
from pathlib import Path

import train

CONFIGS_DIR = Path(__file__).resolve().parent / "configs"

if __name__ == "__main__":
    for model_id in sys.argv[1:]:
        train.run(CONFIGS_DIR / f"{model_id}.toml")
