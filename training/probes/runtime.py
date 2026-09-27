"""Measuring with the shipped TypeScript runtime instead of torch.

The chapter-5 claim is exact ("doesn't change the prediction"), so it is measured on
the runtime the browser runs, whose attention sums keys in a canonical order.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

REPO_DIR = Path(__file__).resolve().parents[2]
SCRIPT = REPO_DIR / "packages/llm/scripts/next-token-probs.ts"


def next_token_probs(model_dir: Path, prompts: list[list[int]]) -> np.ndarray:
    """`[prompts, vocab]` float64 probabilities from `forward` in packages/llm."""
    completed = subprocess.run(
        ["bun", str(SCRIPT), str(model_dir / "manifest.json")],
        input=json.dumps(prompts),
        capture_output=True,
        text=True,
        check=True,
        cwd=REPO_DIR,
    )
    return np.array(json.loads(completed.stdout), dtype=np.float64)
