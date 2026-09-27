/**
 * `/lab/perf?fixture=board-room`: whole-frame GPU time with bloom on vs off, interleaved in
 * short alternating blocks on one renderer so machine load hits both equally. Readback
 * lags a few frames, so each block's first frames are dropped. Results go to
 * `probe.results`; the budget check is the harness's job (it prints them).
 */
import { createRenderer, type FrameInput } from "@repo/renderer";
import { loadFixture } from "./fixtures.ts";
import type { ProbeApi } from "./probe.ts";

const BLOCKS = 12;
const FRAMES_PER_BLOCK = 30;
const SETTLE_FRAMES = 8;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

export async function measureBloom(canvas: HTMLCanvasElement, probe: ProbeApi, fixture: string) {
  const { look, input } = await loadFixture(fixture);
  const renderer = await createRenderer(canvas, look, { timing: true });
  if ("unsupported" in renderer) throw new Error(renderer.unsupported);
  const frame: FrameInput = {
    ...input,
    timeSec: 0,
    viewport: { width: canvas.clientWidth, height: canvas.clientHeight, dpr: devicePixelRatio },
    debug: { bloom: true },
  };
  const samples: Record<"on" | "off", number[]> = { on: [], off: [] };
  for (let block = 0; block < BLOCKS; block++) {
    const bloom = block % 2 === 0;
    frame.debug = { bloom };
    for (let i = 0; i < FRAMES_PER_BLOCK; i++) {
      const { gpuMs } = renderer.frame(frame);
      if (i >= SETTLE_FRAMES && gpuMs !== null) samples[bloom ? "on" : "off"].push(gpuMs);
      await nextFrame();
    }
  }
  renderer.dispose();
  const on = median(samples.on);
  const off = median(samples.off);
  probe.results = {
    size: [canvas.width, canvas.height],
    medianMs: { bloomOn: on, bloomOff: off, delta: on - off },
    samples: { on: samples.on.length, off: samples.off.length },
  };
  if (!(samples.on.length && samples.off.length))
    probe.errors.push("no GPU timings were read back");
}
