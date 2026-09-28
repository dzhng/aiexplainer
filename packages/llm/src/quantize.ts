// Chapter 12's 8-bit weights: `q8_0` blocks (training/quantize.py writes them). Each group
// of 32 values is an f16 scale then 32 int8s, and a value decodes as `scale · q`. The
// product of an f16 and an int8 is exact in f32, so this matches Python bit for bit.
import type { LoadedModel } from "./load.ts";
import { Q8_GROUP } from "./manifest.ts";

const BLOCK_BYTES = 2 + Q8_GROUP;

/** Decodes q8_0 blocks (a view whose byteOffset is 2-byte aligned) to f32. */
export function dequantizeQ8_0(blocks: Uint8Array): Float32Array {
  if (blocks.byteLength % BLOCK_BYTES !== 0) throw new Error("q8_0 data is not whole blocks");
  const count = blocks.byteLength / BLOCK_BYTES;
  const scales = new Float16Array(blocks.buffer, blocks.byteOffset, blocks.byteLength / 2);
  const values = new Int8Array(blocks.buffer, blocks.byteOffset, blocks.byteLength);
  const out = new Float32Array(count * Q8_GROUP);
  for (let b = 0; b < count; b++) {
    const scale = scales[(b * BLOCK_BYTES) / 2]!;
    const first = b * BLOCK_BYTES + 2;
    for (let i = 0; i < Q8_GROUP; i++) out[b * Q8_GROUP + i] = scale * values[first + i]!;
  }
  return out;
}

/** A run of stored weights as the model holds them; for `q8_0`, also the integers and scale. */
export interface WeightSlice {
  /** The values the forward pass uses (f16 or f32 widened; q8_0 decoded as `scale · q`). */
  values: number[];
  /** For a q8_0 tensor: the group's f16 scale and the stored int8s (the run is inside one group). */
  q8?: { scale: number; q: number[] };
}

/** `count` weights of tensor `name` from flat index `start`, exactly as stored. */
export function weightSlice(
  model: LoadedModel,
  name: string,
  start: number,
  count: number,
): WeightSlice {
  const t = model.tensors.get(name);
  if (!t) throw new Error(`${model.manifest.id}: no tensor "${name}"`);
  const size = t.shape.reduce((a, b) => a * b, 1);
  if (!(start >= 0 && count > 0 && start + count <= size))
    throw new Error(`${name}: [${start}, ${start + count}) is outside its ${size} values`);
  if (t.dtype !== "q8_0")
    return { values: Array.from(t.data.subarray(start, start + count), Number) };
  const group = Math.floor(start / Q8_GROUP);
  if (Math.floor((start + count - 1) / Q8_GROUP) !== group)
    throw new Error(`${name}: a q8_0 slice must sit inside one group of ${Q8_GROUP}`);
  const block = t.data.subarray(group * BLOCK_BYTES, (group + 1) * BLOCK_BYTES);
  const scale = new Float16Array(block.buffer, block.byteOffset, 1)[0]!;
  const ints = new Int8Array(block.buffer, block.byteOffset + 2, Q8_GROUP);
  const first = start - group * Q8_GROUP;
  const q = Array.from(ints.subarray(first, first + count));
  return { values: q.map((v) => scale * v), q8: { scale, q } };
}
