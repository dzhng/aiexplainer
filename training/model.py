"""The one PyTorch transformer. Every model in the ladder is this module with different
flags (`Arch`), never a fork. `packages/llm/src/forward.ts` is its TypeScript mirror;
the parity fixtures (`fixtures/make_parity.py`) pin the two together.

State-dict keys, minus their `.weight` suffix, are the manifest's canonical tensor names.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np
import torch
import torch.nn.functional as F
from torch import nn

import export

Trace = dict[str, Any]


@dataclass(frozen=True)
class Mlp:
    """`kind` "none", "swiglu" (w2(silu(w1 x) * w3 x)) or "moe" (top-k of `experts` SwiGLUs)."""

    kind: Literal["none", "swiglu", "moe"] = "none"
    hidden: int = 0
    experts: int = 0
    top_k: int = 0

    def to_json(self) -> Any:
        if self.kind == "none":
            return "none"
        if self.kind == "swiglu":
            return {"kind": "swiglu", "hidden": self.hidden}
        return {"kind": "moe", "experts": self.experts, "topK": self.top_k, "hidden": self.hidden}


@dataclass(frozen=True)
class Arch:
    """`TransformerArch` in packages/llm/src/manifest.ts, field for field."""

    d_model: int
    n_layers: int
    n_heads: int
    n_kv_heads: int
    ctx: int
    vocab: int
    attention: Literal["none", "causal"] = "causal"
    positions: Literal["none", "rope"] = "rope"
    rope_theta: float = 10000.0
    mlp: Mlp = field(default_factory=Mlp)
    norm: Literal["none", "rmsnorm"] = "rmsnorm"
    norm_eps: float = 1e-5
    residual: bool = True
    tied_embeddings: bool = True

    @property
    def head_dim(self) -> int:
        return self.d_model // self.n_heads

    def to_json(self) -> dict[str, Any]:
        camel = {
            "".join(w.capitalize() if i else w for i, w in enumerate(k.split("_"))): v
            for k, v in asdict(self).items()
        }
        camel["mlp"] = self.mlp.to_json()
        return camel

    @staticmethod
    def from_json(data: dict[str, Any]) -> Arch:
        mlp = data["mlp"]
        return Arch(
            d_model=data["dModel"],
            n_layers=data["nLayers"],
            n_heads=data["nHeads"],
            n_kv_heads=data["nKvHeads"],
            ctx=data["ctx"],
            vocab=data["vocab"],
            attention=data["attention"],
            positions=data["positions"],
            rope_theta=data["ropeTheta"],
            mlp=Mlp()
            if mlp == "none"
            else Mlp(mlp["kind"], mlp["hidden"], mlp.get("experts", 0), mlp.get("topK", 0)),
            norm=data["norm"],
            norm_eps=data["normEps"],
            residual=data["residual"],
            tied_embeddings=data["tiedEmbeddings"],
        )


class RMSNorm(nn.Module):
    def __init__(self, d: int, eps: float):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(d))
        self.eps = eps

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.weight


def rope_angles(arch: Arch, device: torch.device | None = None) -> torch.Tensor:
    """`[ctx, head_dim / 2]`: position · theta^(-2i / head_dim), for interleaved pairs (2i, 2i+1)."""
    i = torch.arange(arch.head_dim // 2, dtype=torch.float64, device=device)
    freqs = arch.rope_theta ** (-2 * i / arch.head_dim)
    positions = torch.arange(arch.ctx, dtype=torch.float64, device=device)
    return torch.outer(positions, freqs)


def apply_rope(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    """Rotate interleaved pairs of `x` `[B, heads, T, hd]` by angles with cos/sin `[T, hd/2]`."""
    a, b = x[..., 0::2], x[..., 1::2]
    return torch.stack((a * cos - b * sin, a * sin + b * cos), dim=-1).flatten(-2)


class Attention(nn.Module):
    def __init__(self, arch: Arch):
        super().__init__()
        hd = arch.head_dim
        self.arch = arch
        self.wq = nn.Linear(arch.d_model, arch.n_heads * hd, bias=False)
        self.wk = nn.Linear(arch.d_model, arch.n_kv_heads * hd, bias=False)
        self.wv = nn.Linear(arch.d_model, arch.n_kv_heads * hd, bias=False)
        self.wo = nn.Linear(arch.n_heads * hd, arch.d_model, bias=False)

    def forward(self, x: torch.Tensor, rope: tuple[torch.Tensor, torch.Tensor] | None, trace: Trace | None):
        arch = self.arch
        B, T, _ = x.shape
        hd = arch.head_dim
        q = self.wq(x).view(B, T, arch.n_heads, hd).transpose(1, 2)
        k = self.wk(x).view(B, T, arch.n_kv_heads, hd).transpose(1, 2)
        v = self.wv(x).view(B, T, arch.n_kv_heads, hd).transpose(1, 2)
        group = arch.n_heads // arch.n_kv_heads
        k = k.repeat_interleave(group, dim=1)  # query head h reads kv head h // group
        v = v.repeat_interleave(group, dim=1)
        if trace is not None and rope is not None:
            trace["rope"] = {"qBefore": q, "kBefore": k}
        if rope is not None:
            cos, sin = rope
            q, k = apply_rope(q, cos[:T], sin[:T]), apply_rope(k, cos[:T], sin[:T])
        scores = (q @ k.transpose(-2, -1)) / math.sqrt(hd)
        mask = torch.ones(T, T, dtype=torch.bool, device=x.device).triu(1)
        scores = scores.masked_fill(mask, float("-inf"))
        weights = scores.softmax(-1)
        mixed = weights @ v
        if trace is not None:
            trace.update(q=q, k=k, v=v, scores=scores, weights=weights, mixed=mixed)
        return self.wo(mixed.transpose(1, 2).reshape(B, T, arch.n_heads * hd))


class SwiGLU(nn.Module):
    def __init__(self, d: int, hidden: int):
        super().__init__()
        self.w1 = nn.Linear(d, hidden, bias=False)
        self.w2 = nn.Linear(hidden, d, bias=False)
        self.w3 = nn.Linear(d, hidden, bias=False)

    def forward(self, x: torch.Tensor, trace: Trace | None = None) -> torch.Tensor:
        gate, up = self.w1(x), self.w3(x)
        act = F.silu(gate) * up
        down = self.w2(act)
        if trace is not None:
            trace.update(gate=gate, up=up, act=act, down=down)
        return down


class MoE(nn.Module):
    """Each token mixes its top-k experts, weighted by their renormalised router probabilities."""

    def __init__(self, arch: Arch):
        super().__init__()
        self.top_k = arch.mlp.top_k
        self.router = nn.Linear(arch.d_model, arch.mlp.experts, bias=False)
        self.experts = nn.ModuleList(SwiGLU(arch.d_model, arch.mlp.hidden) for _ in range(arch.mlp.experts))
        self.last_routing: tuple[torch.Tensor, torch.Tensor] | None = None

    def forward(self, x: torch.Tensor, trace: Trace | None = None) -> torch.Tensor:
        probs = self.router(x).softmax(-1)
        top, chosen = probs.topk(self.top_k, dim=-1)
        weights = top / top.sum(-1, keepdim=True)
        gates = torch.zeros_like(probs).scatter(-1, chosen, weights)
        out = sum(gates[..., e : e + 1] * expert(x) for e, expert in enumerate(self.experts))
        self.last_routing = (probs, chosen)
        if trace is not None:
            trace["router"] = {"probs": probs, "experts": chosen.float(), "weights": weights}
        return out


class Layer(nn.Module):
    def __init__(self, arch: Arch):
        super().__init__()
        self.arch = arch
        rms = arch.norm == "rmsnorm"
        if arch.attention == "causal":
            self.attn = Attention(arch)
            self.attn_norm = RMSNorm(arch.d_model, arch.norm_eps) if rms else None
        if arch.mlp.kind == "swiglu":
            self.mlp = SwiGLU(arch.d_model, arch.mlp.hidden)
        elif arch.mlp.kind == "moe":
            self.moe = MoE(arch)
        if arch.mlp.kind != "none":
            self.mlp_norm = RMSNorm(arch.d_model, arch.norm_eps) if rms else None

    def block(self, x, norm, fn, trace: Trace | None, key: str):
        branch = fn(norm(x) if norm is not None else x)
        out = x + branch if self.arch.residual else branch
        if trace is not None:
            trace[key] = {
                "residualIn": x,
                "branch": branch,
                "sum": out,
                "rms": x.pow(2).mean(-1).sqrt(),
            }
        return out

    def forward(self, x: torch.Tensor, rope, trace: Trace | None) -> torch.Tensor:
        if self.arch.attention == "causal":
            attn_trace: Trace | None = {} if trace is not None else None
            x = self.block(x, self.attn_norm, lambda h: self.attn(h, rope, attn_trace), attn_trace, "residual")
            if trace is not None:
                trace["attn"] = attn_trace
        if self.arch.mlp.kind != "none":
            mlp_trace: Trace | None = {} if trace is not None else None
            fn = self.mlp if self.arch.mlp.kind == "swiglu" else self.moe
            x = self.block(x, self.mlp_norm, lambda h: fn(h, mlp_trace), trace, "mlpResidual")
            if trace is not None:
                if "router" in mlp_trace:
                    trace["router"] = mlp_trace["router"]
                else:
                    trace["mlp"] = mlp_trace
        return x


class Transformer(nn.Module):
    def __init__(self, arch: Arch):
        super().__init__()
        self.arch = arch
        self.tok_emb = nn.Embedding(arch.vocab, arch.d_model)
        nn.init.normal_(self.tok_emb.weight, std=0.02)  # GPT-2's embedding init
        self.layers = nn.ModuleList(Layer(arch) for _ in range(arch.n_layers))
        self.norm = RMSNorm(arch.d_model, arch.norm_eps) if arch.norm == "rmsnorm" else None
        self.lm_head = None if arch.tied_embeddings else nn.Linear(arch.d_model, arch.vocab, bias=False)
        if arch.positions == "rope":
            angles = rope_angles(arch)
            self.register_buffer("rope_cos", angles.cos().float(), persistent=False)
            self.register_buffer("rope_sin", angles.sin().float(), persistent=False)

    def forward(self, tokens: torch.Tensor, trace: list[Trace] | None = None) -> torch.Tensor:
        """Logits `[B, T, vocab]`. With `trace`, appends one dict per layer (all tokens and heads)."""
        rope = (self.rope_cos, self.rope_sin) if self.arch.positions == "rope" else None
        x = self.tok_emb(tokens)
        for layer in self.layers:
            layer_trace: Trace | None = {} if trace is not None else None
            x = layer(x, rope, layer_trace)
            if trace is not None:
                trace.append(layer_trace)
        if self.norm is not None:
            x = self.norm(x)
        head = self.tok_emb.weight if self.lm_head is None else self.lm_head.weight
        return x @ head.T

    def export_tensors(self, dtype: np.dtype = np.dtype(np.float16)) -> dict[str, np.ndarray]:
        """Canonical tensor name → array, in state-dict order."""
        return {
            name.removesuffix(".weight"): tensor.detach().cpu().numpy().astype(dtype)
            for name, tensor in self.state_dict().items()
        }


def load_exported(model_dir: Path) -> tuple[dict[str, Any], Transformer]:
    """An exported transformer back as a module (f32 on the CPU), with its manifest."""
    manifest, tensors = export.read_model(model_dir)
    model = Transformer(Arch.from_json(manifest["arch"]))
    state = {
        f"{name}.weight": torch.from_numpy(array.astype(np.float32))
        for name, array in tensors.items()
    }
    model.load_state_dict(state)
    return manifest, model.eval()
