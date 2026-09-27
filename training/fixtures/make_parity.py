"""Random-init parity fixtures: one tiny model per flag combination the ladder uses,
plus torch's logits and full trace for a prompt. `packages/llm/test/forward.test.ts`
must reproduce them within 1e-3.

    uv run python -m fixtures.make_parity
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import torch

import export
import tokenizer
from model import Arch, Mlp, Trace, Transformer
from paths import FIXTURES_DIR

PARITY_DIR = FIXTURES_DIR / "parity"
PROMPT = "Once upon a time, there was a little girl named Lily. She"
SEED = 15
D = 16
CTX = 32


def base(**flags: Any) -> Arch:
    """One layer, two heads, rope, rmsnorm, residuals and tied embeddings, unless overridden."""
    return Arch(**{"d_model": D, "n_layers": 1, "n_heads": 2, "n_kv_heads": 2, "ctx": CTX, "vocab": 4096, **flags})


SWIGLU = Mlp("swiglu", hidden=32)
FIXTURES: dict[str, Arch] = {
    "embed": base(n_layers=0, positions="none", norm="none", tied_embeddings=False),
    "attn": base(positions="none", norm="none"),
    "rope": base(norm="none"),
    "mlp": base(mlp=SWIGLU, norm="none"),
    "mlp-only": base(attention="none", positions="none", mlp=SWIGLU),
    "noresidual": base(n_layers=2, mlp=SWIGLU, norm="none", residual=False),
    "residual": base(n_layers=2, mlp=SWIGLU),
    "gqa": base(n_layers=2, n_heads=4, mlp=SWIGLU, tied_embeddings=False),
    "moe": base(n_layers=2, n_heads=4, mlp=Mlp("moe", hidden=16, experts=4, top_k=2)),
}


# Without residuals or norms the signal shrinks or grows layer by layer; this gain keeps
# the `noresidual` fixture's logits in a range where 1e-3 is a meaningful tolerance.
INIT_GAIN = {"noresidual": 1.1}


def random_model(arch: Arch, seed: int, gain: float = 1.0) -> Transformer:
    """Weights spread enough to make attention and routing non-uniform, rounded to f16."""
    torch.manual_seed(seed)
    model = Transformer(arch)
    with torch.no_grad():
        for name, param in model.named_parameters():
            if name.endswith("norm.weight"):
                param.copy_(1 + 0.3 * torch.randn_like(param))
            elif name.startswith("tok_emb"):
                param.normal_(0, 1)
            elif param.dim() == 2:
                param.normal_(0, gain / math.sqrt(param.shape[1]))
            param.copy_(param.half().float())
    return model.eval()


def f32(value: float) -> float | None:
    """A float32 value in 9 significant digits (enough to round-trip); -inf (masked) as None."""
    return None if math.isinf(value) else float(f"{value:.9g}")


def tensor_json(t: torch.Tensor) -> dict[str, Any]:
    return {"shape": list(t.shape), "data": [f32(v) for v in t.detach().flatten().tolist()]}


def heads_first(t: torch.Tensor) -> dict[str, Any]:
    """`[heads, T, ...]` (batch 0) → the runtime's `[T, heads, ...]`."""
    return tensor_json(t.transpose(0, 1))


def residual_json(r: Trace) -> dict[str, Any]:
    return {k: tensor_json(r[k][0]) for k in ("residualIn", "branch", "sum", "rms")}


def layer_json(layer: Trace) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if "attn" in layer:
        a = layer["attn"]
        out["attn"] = {k: heads_first(a[k][0]) for k in ("q", "k", "v", "scores", "weights", "mixed")}
        if "rope" in a:
            out["attn"]["rope"] = {k: heads_first(v[0]) for k, v in a["rope"].items()}
        out["attn"]["residual"] = residual_json(a["residual"])
    if "mlp" in layer:
        out["mlp"] = {k: tensor_json(v[0]) for k, v in layer["mlp"].items()}
    if "router" in layer:
        out["router"] = {k: tensor_json(v[0]) for k, v in layer["router"].items()}
    if "mlpResidual" in layer:
        out["mlpResidual"] = residual_json(layer["mlpResidual"])
    return out


def reference(model: Transformer, tokens: list[int]) -> dict[str, Any]:
    """Last-position logits and every layer's trace, in the runtime's shapes."""
    trace: list[Trace] = []
    with torch.no_grad():
        logits = model(torch.tensor([tokens]), trace)
    return {
        "tokens": tokens,
        "logits": [f32(v) for v in logits[0, -1].tolist()],
        "layers": [layer_json(layer) for layer in trace],
    }


def prompt_tokens() -> list[int]:
    reference_tokenizer = tokenizer.from_minimal(json.loads(tokenizer.TOKENIZER_FILE.read_text()))
    return tokenizer.encode(reference_tokenizer, PROMPT)


def write_fixture(name: str, arch: Arch, out_dir: Path) -> None:
    model = random_model(arch, SEED, INIT_GAIN.get(name, 1.0))
    export.export_model(
        out_dir,
        model_id=f"fixture-{name}",
        kind="transformer",
        tokenizer=export.bpe_tokenizer_ref(out_dir),
        tensors=model.export_tensors(),
        training=None,
        evidence=[],
        arch=arch.to_json(),
    )
    (out_dir / "reference.json").write_text(json.dumps(reference(model, prompt_tokens())) + "\n")


def main() -> None:
    for name, arch in FIXTURES.items():
        write_fixture(name, arch, PARITY_DIR / name)
        print(f"wrote {PARITY_DIR / name}")


if __name__ == "__main__":
    main()
