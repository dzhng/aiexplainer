"""One measured probe result, the `ProbeResult` of packages/llm/src/manifest.ts (D25)."""

from __future__ import annotations

from typing import Any


def result(
    probe: str,
    prompt: str,
    metric: str,
    value: float,
    threshold: float,
    *,
    at_most: bool = False,
) -> dict[str, Any]:
    """Passes when `value >= threshold`, or `value <= threshold` with `at_most`."""
    return {
        "probe": probe,
        "prompt": prompt,
        "metric": metric,
        "value": float(value),
        "threshold": threshold,
        "pass": bool(value <= threshold if at_most else value >= threshold),
    }
