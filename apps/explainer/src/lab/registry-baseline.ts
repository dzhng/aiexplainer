/**
 * `/lab/registry`: the browser registry-baseline test. Count and bytes must return to the
 * baseline after 10 resizes, a look (pipeline-resource) rebuild and 3 scene resets, and to
 * zero after dispose. Failures land in `probe.errors`, which fails the harness.
 */
import { createRenderer, type FrameInput, type RegistryStats } from "@repo/renderer";
import { d, tgpu } from "typegpu";
import { loadFixture } from "./fixtures.ts";
import type { ProbeApi } from "./probe.ts";

/** Does `root.destroy()` free buffers the root created? (Sources disagree; measure it.) */
async function rootDestroyFreesBuffers(): Promise<boolean> {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  // Writing to a destroyed buffer is a validation error; the control proves the check works.
  const writeFails = async (buffer: GPUBuffer) => {
    device.pushErrorScope("validation");
    device.queue.writeBuffer(buffer, 0, new Float32Array(1));
    return (await device.popErrorScope()) !== null;
  };
  const control = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  control.destroy();
  if (!(await writeFails(control))) throw new Error("destroyed-buffer check is not observable");
  const root = tgpu.initFromDevice({ device });
  const raw = root.unwrap(root.createBuffer(d.f32).$usage("uniform"));
  root.destroy();
  const freed = await writeFails(raw);
  device.destroy();
  return freed;
}

export async function registryBaseline(canvas: HTMLCanvasElement, probe: ProbeApi): Promise<void> {
  const { look, input } = loadFixture("boxes");
  const renderer = await createRenderer(canvas, look);
  if ("unsupported" in renderer) throw new Error(renderer.unsupported);
  const frameInput: FrameInput = {
    ...input,
    timeSec: 0,
    viewport: { width: 800, height: 500, dpr: 1 },
  };
  const stats = (): RegistryStats => ({ ...renderer.frame(frameInput).registry });
  const setSize = (width: number, height: number) => {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    renderer.resize();
  };

  setSize(800, 500);
  const baseline = stats();
  for (let i = 0; i < 10; i++) {
    setSize(320 + i * 131, 240 + i * 67);
    stats();
  }
  setSize(800, 500);
  renderer.setLook(look);
  stats();
  for (let i = 0; i < 3; i++) {
    frameInput.scene = { ...frameInput.scene, revision: frameInput.scene.revision + 1 };
    stats();
  }
  const after = stats();
  renderer.dispose();
  const disposed = stats();

  const same = (a: RegistryStats, b: RegistryStats) => a.count === b.count && a.bytes === b.bytes;
  if (!same(baseline, after))
    probe.errors.push(
      `registry leaked: baseline ${JSON.stringify(baseline)}, after ${JSON.stringify(after)}`,
    );
  if (disposed.count !== 0 || disposed.bytes !== 0)
    probe.errors.push(`registry not empty after dispose: ${JSON.stringify(disposed)}`);
  probe.results = {
    baseline,
    after,
    disposed,
    rootDestroyFreesBuffers: await rootDestroyFreesBuffers(),
  };
}
