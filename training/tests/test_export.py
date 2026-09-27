import numpy as np
import pytest

import export


def test_tensors_are_packed_little_endian_on_aligned_offsets():
    blob, table = export.pack_tensors(
        {
            "a": np.array([1, 2, 3], dtype=np.uint32),
            "b": np.array([[0.5, -2.0]], dtype=np.float16),
            "c": np.array([1.0], dtype=np.float32),
        }
    )
    assert [(t["name"], t["dtype"], t["shape"]) for t in table] == [
        ("a", "u32", [3]),
        ("b", "f16", [1, 2]),
        ("c", "f32", [1]),
    ]
    assert [t["byteOffset"] for t in table] == [0, 64, 128]
    assert [t["byteLength"] for t in table] == [12, 4, 4]
    assert blob[:12] == bytes([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0])
    assert blob[64:68] == bytes.fromhex("003800c0")  # f16 0.5 and -2.0, little-endian
    assert len(blob) == 132


def test_unsupported_dtypes_are_rejected():
    with pytest.raises(ValueError, match="float64"):
        export.pack_tensors({"x": np.zeros(2)})
