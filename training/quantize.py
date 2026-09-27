"""`full-q8`: the `full` model with every weight matrix quantized to 8 bits (chapter 12).

Symmetric int8 per group of 32 consecutive values (row-major), stored as `q8_0`: each
group is an f16 scale (`max|x| / 127`, rounded to f16) followed by 32 int8 values
`round(x / scale)`. Decoding (`export.dequantize_q8_0`, and `dequantizeQ8_0` in
packages/llm) is `float32(scale) · q`, exact in both. Norm gains stay f16.

    uv run python quantize.py      # reads models/full, writes and probes models/full-q8
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

import data
import export
import train
from model import load_exported
from paths import FIXTURES_DIR, MODELS_DIR
from probes import quantization

FIXTURE = FIXTURES_DIR / "q8.json"


def quantize_q8_0(values: np.ndarray) -> bytes:
    """Float values (a multiple of 32 of them) → q8_0 blocks."""
    groups = values.astype(np.float32).reshape(-1, export.Q8_GROUP)
    scales = (np.abs(groups).max(axis=1) / 127).astype(np.float16)
    divisor = np.where(scales == 0, 1, scales).astype(np.float32)[:, None]
    q = np.clip(np.rint(groups / divisor), -127, 127).astype(np.int8)
    blocks = np.empty((len(groups), export.Q8_BLOCK_BYTES), dtype=np.uint8)
    blocks[:, :2] = scales.astype("<f2").view(np.uint8).reshape(-1, 2)
    blocks[:, 2:] = q.view(np.uint8)
    return blocks.tobytes()


def quantized_tensors(tensors: dict[str, np.ndarray]) -> dict[str, np.ndarray | export.Q8Tensor]:
    """Every matrix whose rows split into groups of 32 becomes q8_0; the rest stay as is."""
    return {
        name: export.Q8Tensor(quantize_q8_0(array), array.shape)
        if array.ndim == 2 and array.shape[-1] % export.Q8_GROUP == 0
        else array
        for name, array in tensors.items()
    }


def write_fixture() -> None:
    """Blocks and their Python decoding, for the TypeScript bit-for-bit test."""
    rng = np.random.default_rng(12)
    values = np.concatenate(
        [
            rng.normal(0, 0.05, 64),
            np.zeros(32),  # an all-zero group (scale 0)
            rng.normal(0, 1e-6, 32),  # scales in f16's subnormal range
            np.linspace(-3, 3, 32),  # the extremes land on ±127
        ]
    ).astype(np.float32)
    blocks = quantize_q8_0(values)
    decoded = export.dequantize_q8_0(blocks)
    FIXTURE.write_text(json.dumps({"blocksHex": blocks.hex(), "values": [float(v) for v in decoded]}) + "\n")


def main() -> None:
    source, out_dir = MODELS_DIR / "full", MODELS_DIR / "full-q8"
    manifest, tensors = export.read_model(source)

    def write(evidence: list[dict[str, Any]]) -> None:
        export.export_model(
            out_dir,
            model_id="full-q8",
            kind="transformer",
            tokenizer=export.bpe_tokenizer_ref(out_dir),
            tensors=quantized_tensors(tensors),
            training=manifest["training"],
            evidence=evidence,
            arch=manifest["arch"],
        )

    write([])
    evidence, scenarios = quantization.quantization(source, out_dir)
    write(evidence)
    (out_dir / "scenarios.json").write_text(json.dumps({"quantization": scenarios}, indent=2) + "\n")
    write_fixture()
    _, shipped = load_exported(out_dir)
    fixture = train.parity_fixture(shipped, data.load_tokens("valid"), seed=0)
    (train.TRAINED_FIXTURES_DIR / "full-q8.json").write_text(json.dumps(fixture) + "\n")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
