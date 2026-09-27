/**
 * Whole-frame GPU time from two timestamps: the start of the first pass and the end of the
 * last (per-pass timestamps are not meaningful on Apple GPUs). Readback is asynchronous
 * through a small ring of mappable buffers, so a result arrives a few frames late and a
 * frame is skipped when every buffer is still in flight. Opt-in: it allocates a promise
 * per measured frame.
 */
import type { Scope } from "./registry.ts";

const RING = 3;

export class FrameTimer {
  readonly begin: GPURenderPassTimestampWrites;
  readonly end: GPURenderPassTimestampWrites;
  /** Milliseconds of the latest frame whose readback has landed. */
  lastMs: number | null = null;
  #querySet: GPUQuerySet;
  #resolve: GPUBuffer;
  #readback: { buffer: GPUBuffer; busy: boolean }[];
  #pending: { buffer: GPUBuffer; busy: boolean } | null = null;

  constructor(device: GPUDevice, scope: Scope) {
    this.#querySet = scope.raw(device.createQuerySet({ type: "timestamp", count: 2 }), 16);
    this.#resolve = scope.raw(
      device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      }),
      16,
    );
    this.#readback = Array.from({ length: RING }, () => ({
      buffer: scope.raw(
        device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
        16,
      ),
      busy: false,
    }));
    this.begin = { querySet: this.#querySet, beginningOfPassWriteIndex: 0 };
    this.end = { querySet: this.#querySet, endOfPassWriteIndex: 1 };
  }

  /** Call after the last pass is encoded. */
  encode(encoder: GPUCommandEncoder): void {
    const slot = this.#readback.find((r) => !r.busy);
    if (!slot) return;
    encoder.resolveQuerySet(this.#querySet, 0, 2, this.#resolve, 0);
    encoder.copyBufferToBuffer(this.#resolve, 0, slot.buffer, 0, 16);
    slot.busy = true;
    this.#pending = slot;
  }

  /** Call after the frame is submitted. */
  collect(): void {
    const slot = this.#pending;
    if (!slot) return;
    this.#pending = null;
    slot.buffer.mapAsync(GPUMapMode.READ).then(
      () => {
        const [start, end] = new BigUint64Array(slot.buffer.getMappedRange());
        if (start && end && end > start) this.lastMs = Number(end - start) / 1e6;
        slot.buffer.unmap();
        slot.busy = false;
      },
      // Destroyed (renderer disposed) while in flight: nothing to read.
      () => {},
    );
  }
}
