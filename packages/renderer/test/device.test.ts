import { expect, test } from "bun:test";
import { probeAdapter } from "../src/device.ts";

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
