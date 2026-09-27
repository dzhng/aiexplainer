import { expect, test } from "bun:test";
import type { TgpuRoot } from "typegpu";
import { GEOMETRY_PIPELINES } from "../src/passes/geometry.ts";
import { DEPTH_CLEAR, DEPTH_FORMAT, describePipeline } from "../src/pipeline.ts";

/** Enough of a root to build descriptors without a GPU; records the shader code. */
function stubRoot() {
  const code: string[] = [];
  const root = {
    unwrap: () => ({}),
    device: {
      createShaderModule: (descriptor: { code: string }) => {
        code.push(descriptor.code);
        return {};
      },
      createPipelineLayout: () => ({}),
    },
  } as unknown as Pick<TgpuRoot, "unwrap" | "device">;
  return { root, code };
}

test("translucent geometry reads depth and never writes it", () => {
  const { root } = stubRoot();
  const descriptor = describePipeline(root, GEOMETRY_PIPELINES.translucent);
  expect(descriptor.depthStencil).toMatchObject({
    depthWriteEnabled: false,
    depthCompare: "greater",
  });
  expect([...(descriptor.fragment?.targets ?? [])][0]?.blend).toBeDefined();
});

test("reverse-Z depth32float; the prepass has no fragment stage and shares the vertex stage", () => {
  const { root, code } = stubRoot();
  expect(DEPTH_FORMAT).toBe("depth32float");
  expect(DEPTH_CLEAR).toBe(0);
  const prepass = describePipeline(root, GEOMETRY_PIPELINES.prepass);
  expect(prepass.fragment).toBeUndefined();
  expect(prepass.depthStencil).toMatchObject({ depthWriteEnabled: true, depthCompare: "greater" });
  const opaque = describePipeline(root, GEOMETRY_PIPELINES.opaque);
  expect(opaque.depthStencil).toMatchObject({ depthWriteEnabled: false, depthCompare: "equal" });
  expect(code[0]).toContain("@invariant");
  expect(code[0]).toBe(code[1]!);
});
