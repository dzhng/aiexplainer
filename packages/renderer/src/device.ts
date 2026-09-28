import { tgpu, type TgpuRoot } from "typegpu";

export interface AdapterReport {
  vendor: string;
  architecture: string;
  isFallbackAdapter: boolean;
  features: string[];
}

/** Reports the adapter WebGPU would give us, or `null` when there is none. */
export async function probeAdapter(gpu: GPU | undefined): Promise<AdapterReport | null> {
  const adapter = await gpu?.requestAdapter();
  if (!adapter) return null;
  const { vendor, architecture, isFallbackAdapter } = adapter.info;
  return { vendor, architecture, isFallbackAdapter, features: [...adapter.features].sort() };
}

export interface Capabilities {
  canvasFormat: GPUTextureFormat;
  /** Whole-frame GPU timing is available (used by performance probes only). */
  timestampQuery: boolean;
}

export interface Gpu {
  root: TgpuRoot;
  device: GPUDevice;
  caps: Capabilities;
}

/**
 * The one TypeGPU root and its capability record. Uncaptured validation errors go to
 * `console.error`, which the verification harness treats as a failed render.
 */
export async function initGpu(): Promise<Gpu | { unsupported: string }> {
  if (!navigator.gpu) return { unsupported: "WebGPU is not available in this browser" };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { unsupported: "no WebGPU adapter" };
  if (adapter.info.isFallbackAdapter) return { unsupported: "only a software WebGPU adapter" };
  const root = await tgpu.init({
    adapter: {},
    device: { optionalFeatures: ["timestamp-query"] },
  });
  const device = root.device;
  device.addEventListener("uncapturederror", (event) =>
    console.error(`WebGPU: ${(event as GPUUncapturedErrorEvent).error.message}`),
  );
  return {
    root,
    device,
    caps: {
      canvasFormat: navigator.gpu.getPreferredCanvasFormat(),
      timestampQuery: device.features.has("timestamp-query"),
    },
  };
}

/**
 * Builds on a fresh GPU (`init`), or says why it cannot: no usable adapter, a refused device,
 * or a build that throws, in which case the device and everything made on it are released.
 * An adapter probe can pass and any of these still fail.
 */
export async function withGpu<T>(
  build: (gpu: Gpu) => Promise<T>,
  init: () => Promise<Gpu | { unsupported: string }> = initGpu,
): Promise<T | { unsupported: string }> {
  let gpu: Gpu | { unsupported: string };
  try {
    gpu = await init();
  } catch (error) {
    return { unsupported: `the WebGPU device failed: ${messageOf(error)}` };
  }
  if ("unsupported" in gpu) return gpu;
  try {
    return await build(gpu);
  } catch (error) {
    gpu.root.destroy();
    return { unsupported: `the renderer failed to start: ${messageOf(error)}` };
  }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
