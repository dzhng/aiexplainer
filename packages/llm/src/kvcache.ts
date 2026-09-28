// The KV cache (chapter 10's sticky notes): each layer's keys and values for the positions a
// model has already read, so a new token reads them instead of recomputing them. `forward`
// appends a call's keys and values and reads the cache back; with a sliding window a smaller
// cache is a ring, and a position's notes are overwritten (evicted) once they fall out of
// every window.
import type { Transformer } from "./transformer.ts";

export interface KvCache {
  /** Positions written so far (the next call's first position). */
  length: number;
  /** Positions the cache holds at once; position p lives in row p % capacity. */
  capacity: number;
  /** Per layer, `[capacity, nKvHeads, headDim]`, keys after RoPE. */
  k: Float32Array[];
  v: Float32Array[];
}

/** An empty cache for `model`, holding `capacity` positions (its whole context by default). */
export function createKvCache(model: Transformer, capacity = model.arch.ctx): KvCache {
  if (!(capacity >= 1 && capacity <= model.arch.ctx))
    throw new Error(`a KV cache holds 1–${model.arch.ctx} positions, not ${capacity}`);
  const size = capacity * model.arch.nKvHeads * model.headDim;
  return {
    length: 0,
    capacity,
    k: Array.from({ length: model.arch.nLayers }, () => new Float32Array(size)),
    v: Array.from({ length: model.arch.nLayers }, () => new Float32Array(size)),
  };
}

/** Forgets every position (the arrays are reused). */
export function resetKvCache(kv: KvCache): void {
  kv.length = 0;
}

/** The row position `pos` occupies. */
export function kvRow(kv: KvCache, pos: number): number {
  return pos % kv.capacity;
}

/** Positions whose notes the cache still holds: the last `capacity` written. */
export function kvHeld(kv: KvCache): number {
  return Math.min(kv.length, kv.capacity);
}

/** Bytes one position's notes take: a key and a value per KV head per layer, as f32. */
export function cacheBytesPerToken(model: Transformer): number {
  return (
    2 * model.arch.nLayers * model.arch.nKvHeads * model.headDim * Float32Array.BYTES_PER_ELEMENT
  );
}

/** Bytes of notes the cache holds now. */
export function kvBytes(kv: KvCache, model: Transformer): number {
  return kvHeld(kv) * cacheBytesPerToken(model);
}
