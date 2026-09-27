"""The one exporter for every model: `manifest.json` plus `weights.bin`.

The format is owned by `packages/llm/src/manifest.ts`, which emits
`packages/llm/schema/manifest.schema.json`; the tests validate every export against
it. Tensors are little-endian, C-ordered, and each starts on a `TENSOR_ALIGNMENT`
byte boundary so the runtime can view them in place.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import torch

REPO_DIR = Path(__file__).resolve().parent.parent
FORMAT_VERSION = 1
TENSOR_ALIGNMENT = 64
WEIGHTS_FILE = "weights.bin"
MANIFEST_FILE = "manifest.json"
DATASET = "TinyStoriesV2-GPT4"
LICENSE = "CDLA-Sharing-1.0"

DTYPES = {np.dtype(np.float16): "f16", np.dtype(np.float32): "f32", np.dtype(np.uint32): "u32"}


def git_sha() -> str:
    """HEAD's commit, suffixed `-dirty` when the working tree has changes."""

    def git(*args: str) -> str:
        return subprocess.run(
            ["git", *args], cwd=REPO_DIR, check=True, capture_output=True, text=True
        ).stdout.strip()

    sha = git("rev-parse", "HEAD")
    return f"{sha}-dirty" if git("status", "--porcelain") else sha


def training_record(
    *,
    seed: int,
    steps: int,
    tokens_seen: int,
    wall_seconds: float,
) -> dict[str, Any]:
    return {
        "dataset": DATASET,
        "license": LICENSE,
        "seed": seed,
        "steps": steps,
        "tokensSeen": tokens_seen,
        "wallSeconds": round(wall_seconds, 3),
        "torch": torch.__version__,
        "gitSha": git_sha(),
    }


def pack_tensors(tensors: dict[str, np.ndarray]) -> tuple[bytes, list[dict[str, Any]]]:
    """Lay tensors out back to back on aligned offsets; return the bytes and their table."""
    blob = bytearray()
    table = []
    for name, array in tensors.items():
        dtype = DTYPES.get(array.dtype)
        if dtype is None:
            raise ValueError(f"tensor {name!r} has unsupported dtype {array.dtype}")
        data = np.ascontiguousarray(array, dtype=array.dtype.newbyteorder("<")).tobytes()
        blob.extend(b"\0" * (-len(blob) % TENSOR_ALIGNMENT))
        table.append(
            {
                "name": name,
                "dtype": dtype,
                "shape": list(array.shape),
                "byteOffset": len(blob),
                "byteLength": len(data),
            }
        )
        blob.extend(data)
    return bytes(blob), table


def export_model(
    out_dir: Path,
    *,
    model_id: str,
    kind: str,
    tokenizer: dict[str, Any],
    tensors: dict[str, np.ndarray],
    training: dict[str, Any],
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    """Write `out_dir/{manifest.json, weights.bin}` and return the manifest."""
    out_dir.mkdir(parents=True, exist_ok=True)
    weights, table = pack_tensors(tensors)
    (out_dir / WEIGHTS_FILE).write_bytes(weights)
    manifest = {
        "formatVersion": FORMAT_VERSION,
        "id": model_id,
        "kind": kind,
        "tokenizer": tokenizer,
        "weightsFile": WEIGHTS_FILE,
        "weightsSha256": hashlib.sha256(weights).hexdigest(),
        "tensors": table,
        "training": training,
        "evidence": evidence,
    }
    (out_dir / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
