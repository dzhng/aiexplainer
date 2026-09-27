"""One measured probe result, the `ProbeResult` of packages/llm/src/manifest.ts (D25)."""

from __future__ import annotations

from typing import Any


def result(probe: str, prompt: str, metric: str, value: float, threshold: float) -> dict[str, Any]:
    return {
        "probe": probe,
        "prompt": prompt,
        "metric": metric,
        "value": value,
        "threshold": threshold,
        "pass": value >= threshold,
    }
