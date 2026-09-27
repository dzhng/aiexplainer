import json
from pathlib import Path

import pytest
import torch

import export
from fixtures import make_parity
from model import Arch, load_exported
from schemas import validate

PARITY = sorted(make_parity.PARITY_DIR.iterdir())


def max_abs_diff(a, b) -> float:
    if isinstance(b, dict):
        return max((max_abs_diff(a[k], b[k]) for k in b), default=0.0)
    if isinstance(b, list):
        return max((max_abs_diff(x, y) for x, y in zip(a, b, strict=True)), default=0.0)
    if a is None or b is None:
        assert a is b, "masked scores must stay masked"
        return 0.0
    return abs(a - b)


def test_there_is_a_fixture_per_flag_combination():
    assert [p.name for p in PARITY] == sorted(make_parity.FIXTURES)


@pytest.mark.parametrize("fixture", PARITY, ids=lambda p: p.name)
def test_parity_fixture_is_what_model_py_computes_from_its_weights(fixture: Path):
    """model.py and the committed reference agree, so the TS parity test pins model.py itself."""
    manifest, model = load_exported(fixture)
    validate(manifest, "manifest.schema.json")
    expected = json.loads((fixture / "reference.json").read_text())
    actual = make_parity.reference(model, expected["tokens"])
    assert max_abs_diff(actual, expected) < 1e-5


@pytest.mark.parametrize("name", ["gqa", "moe"])
def test_regenerating_a_fixture_gives_the_same_weights(name: str, tmp_path: Path):
    make_parity.write_fixture(name, make_parity.FIXTURES[name], tmp_path)
    committed = make_parity.PARITY_DIR / name / "weights.bin"
    assert (tmp_path / "weights.bin").read_bytes() == committed.read_bytes()


def test_arch_round_trips_through_the_manifest_json():
    arch = make_parity.FIXTURES["moe"]
    assert Arch.from_json(json.loads(json.dumps(arch.to_json()))) == arch


def test_bpe_tokenizer_path_is_relative_to_the_manifest():
    manifest, _ = export.read_model(make_parity.PARITY_DIR / "attn")
    target = (make_parity.PARITY_DIR / "attn" / manifest["tokenizer"]["file"]).resolve()
    assert target == export.tokenizer.TOKENIZER_FILE.resolve()


def test_torch_attention_is_causal():
    _, model = load_exported(make_parity.PARITY_DIR / "gqa")
    tokens = torch.tensor([[5, 9, 11, 40, 7]])
    changed = tokens.clone()
    changed[0, -1] = 99
    with torch.no_grad():
        assert torch.equal(model(tokens)[0, :-1], model(changed)[0, :-1])
