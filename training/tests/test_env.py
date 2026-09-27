import torch


def test_torch_runs_on_mps():
    """Training targets Apple Silicon (spec D30); fail loudly if MPS is unavailable."""
    assert torch.backends.mps.is_available()
    x = torch.ones(4, device="mps")
    assert float((x * 2).sum()) == 8.0
