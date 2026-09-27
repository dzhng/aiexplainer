import json

import numpy as np
import pytest
import torch

import export
import paths
import quantize
import train
from model import Arch, Mlp, Transformer
from schemas import validate

MOE = Arch(d_model=32, n_layers=1, n_heads=2, n_kv_heads=1, ctx=32, vocab=4096, mlp=Mlp("moe", 32, experts=8, top_k=2))


def test_q8_0_round_trips_within_half_a_step_per_group():
    values = np.random.default_rng(0).normal(0, 0.1, 32 * 20).astype(np.float32)
    decoded = export.dequantize_q8_0(quantize.quantize_q8_0(values))
    groups, back = values.reshape(-1, 32), decoded.reshape(-1, 32)
    step = np.abs(groups).max(axis=1, keepdims=True) / 127
    assert np.all(np.abs(groups - back) <= step * 0.51 + 1e-6)


def test_committed_q8_fixture_is_what_the_code_writes(tmp_path, monkeypatch):
    monkeypatch.setattr(quantize, "FIXTURE", tmp_path / "q8.json")
    quantize.write_fixture()
    assert (tmp_path / "q8.json").read_text() == (paths.FIXTURES_DIR / "q8.json").read_text()


def test_q8_tensors_export_and_read_back_dequantized(tmp_path):
    matrix = np.random.default_rng(1).normal(0, 1, (4, 64)).astype(np.float16)
    tensors = quantize.quantized_tensors({"m": matrix, "gain": np.ones(64, dtype=np.float16)})
    blob, table = export.pack_tensors(tensors)
    assert [(t["name"], t["dtype"], t["byteLength"]) for t in table] == [("m", "q8_0", 8 * 34), ("gain", "f16", 128)]
    manifest = {"tensors": table, "weightsFile": "w.bin", "weightsSha256": export.hashlib.sha256(blob).hexdigest()}
    (tmp_path / "w.bin").write_bytes(blob)
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    _, back = export.read_model(tmp_path)
    assert back["m"].shape == (4, 64)
    assert np.abs(back["m"] - matrix.astype(np.float32)).max() < 0.05


def collapsed_moe() -> Transformer:
    torch.manual_seed(0)
    model = Transformer(MOE)
    with torch.no_grad():
        model.layers[0].moe.router.weight.zero_()  # every token ties; top-2 is always experts 0 and 1
    return model


def test_moe_export_gate_refuses_a_collapsed_router():
    tokens = np.random.default_rng(0).integers(0, 4096, 10_000).astype(np.uint16)
    with pytest.raises(train.ExportGateError, match="entropy"):
        train.moe_export_gate(collapsed_moe(), tokens)


def test_moe_export_gate_passes_a_spread_router():
    torch.manual_seed(0)
    model = Transformer(MOE)
    with torch.no_grad():
        model.layers[0].moe.router.weight.normal_(0, 1.0)
    tokens = np.random.default_rng(0).integers(0, 4096, 10_000).astype(np.uint16)
    assert train.moe_export_gate(model, tokens) >= train.MOE_ENTROPY_GATE


def test_balance_loss_is_one_when_uniform_and_grows_when_routing_concentrates():
    torch.manual_seed(0)
    model = Transformer(MOE)
    x = torch.randint(0, 4096, (4, 16))
    with torch.no_grad():
        router = model.layers[0].moe.router.weight
        router.zero_()
        model(x)
        assert float(model.balance_loss()) == pytest.approx(1.0)
        router[0] = model.tok_emb.weight.mean(0) * 1e4  # expert 0 scores highest for every token
        model(x)
        assert float(model.balance_loss()) > 1.5


def test_full_q8_is_exported_with_q8_tensors_evidence_and_scenarios():
    model_dir = paths.MODELS_DIR / "full-q8"
    manifest = json.loads((model_dir / "manifest.json").read_text())
    validate(manifest, "manifest.schema.json")
    validate(json.loads((model_dir / "scenarios.json").read_text()), "scenarios.schema.json")
    assert manifest["evidence"]
    assert {t["dtype"] for t in manifest["tensors"]} == {"q8_0", "f16"}
    assert (train.TRAINED_FIXTURES_DIR / "full-q8.json").exists()
