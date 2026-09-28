import { describe, expect, test } from "bun:test";
import { probeAdapter, withGpu, type Gpu } from "../src/device.ts";

describe("withGpu: an adapter probe can pass and the renderer still fail to start", () => {
  const fakeGpu = () => {
    const destroyed: boolean[] = [];
    const gpu = {
      root: { destroy: () => destroyed.push(true) },
      device: {},
      caps: { canvasFormat: "bgra8unorm", timestampQuery: false },
    } as unknown as Gpu;
    return { gpu, destroyed };
  };

  test("a build that throws releases the device and reports why", async () => {
    const { gpu, destroyed } = fakeGpu();
    const result = await withGpu(
      () => Promise.reject(new Error("pipeline compile failed")),
      async () => gpu,
    );
    expect(result).toEqual({
      unsupported: "the renderer failed to start: pipeline compile failed",
    });
    expect(destroyed).toEqual([true]);
  });

  test("a refused device is reported, not thrown", async () => {
    const result = await withGpu(
      async () => "never built",
      () => Promise.reject(new Error("requestDevice: out of memory")),
    );
    expect(result).toEqual({
      unsupported: "the WebGPU device failed: requestDevice: out of memory",
    });
  });

  test("a build that succeeds keeps its device", async () => {
    const { gpu, destroyed } = fakeGpu();
    expect(
      await withGpu(
        async (g) => g.caps.canvasFormat,
        async () => gpu,
      ),
    ).toBe("bgra8unorm");
    expect(destroyed).toEqual([]);
  });
});

test("probeAdapter returns null without WebGPU", async () => {
  expect(await probeAdapter(undefined)).toBeNull();
  const noAdapter = { requestAdapter: async () => null } as unknown as GPU;
  expect(await probeAdapter(noAdapter)).toBeNull();
});

test("probeAdapter reports adapter info and sorted features", async () => {
  const gpu = {
    requestAdapter: async () => ({
      info: { vendor: "apple", architecture: "metal-3", isFallbackAdapter: false },
      features: new Set(["timestamp-query", "shader-f16"]),
    }),
  } as unknown as GPU;
  expect(await probeAdapter(gpu)).toEqual({
    vendor: "apple",
    architecture: "metal-3",
    isFallbackAdapter: false,
    features: ["shader-f16", "timestamp-query"],
  });
});
