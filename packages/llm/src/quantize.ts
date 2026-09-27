// Chapter 12's 8-bit weights: `q8_0` blocks (training/quantize.py writes them). Each group
// of 32 values is an f16 scale then 32 int8s, and a value decodes as `scale · q`. The
// product of an f16 and an int8 is exact in f32, so this matches Python bit for bit.
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
