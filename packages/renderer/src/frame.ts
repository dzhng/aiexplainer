/**
 * The one frame function. Every pass is encoded here, in this order:
 *   1. depth prepass: opaque geometry, no fragment stage;
 *   2. colour pass into 4× MSAA rgba16float — backdrop, opaque
 *      (depth `equal`), then translucent (depth read-only); the pass end resolves into
 *      the HDR target;
 *   3. bloom: prefilter, downsample and upsample through the mip chain (skippable);
 *   4. tonemap from the resolved HDR target plus bloom to the swapchain.
 * Nothing here allocates except the encoder objects WebGPU itself hands out.
 */
import type { FrameReceipt } from "./frame-input.ts";
import { encodeBloom, type BloomChain, type BloomPipelines } from "./passes/bloom.ts";
import type { GeometryPipelines } from "./passes/geometry.ts";
import { DEPTH_CLEAR } from "./pipeline.ts";
import type { FrameTimer } from "./timing.ts";
import type { Draw } from "./scene.ts";

export interface FramePipelines {
  geometry: GeometryPipelines;
  background: GPURenderPipeline;
  bloom: BloomPipelines;
  tonemap: GPURenderPipeline;
}

/** Size-dependent targets and the pass descriptors that point at them. */
export interface FrameTargets {
  width: number;
  height: number;
  prepass: GPURenderPassDescriptor;
  colour: GPURenderPassDescriptor;
  tonemap: GPURenderPassDescriptor & { colorAttachments: [GPURenderPassColorAttachment] };
  postBindGroup: GPUBindGroup;
  bloom: BloomChain;
}

export interface FrameScene {
  bindGroup: GPUBindGroup;
  indexBuffer: GPUBuffer;
  draws: Draw[];
}

/** Look-dependent bindings: group 0 (camera + look). */
export interface FrameLook {
  frame: GPUBindGroup;
}

function drawGeometry(
  pass: GPURenderPassEncoder,
  draws: Draw[],
  translucent: boolean,
  receipt: FrameReceipt,
): void {
  for (const draw of draws) {
    if (draw.translucent !== translucent) continue;
    pass.drawIndexed(
      draw.indexCount,
      draw.instanceCount,
      draw.firstIndex,
      draw.baseVertex,
      draw.firstInstance,
    );
    receipt.drawCalls += 1;
    receipt.triangles += (draw.indexCount / 3) * draw.instanceCount;
  }
}

function fullscreen(pass: GPURenderPassEncoder, receipt: FrameReceipt): void {
  pass.draw(3);
  receipt.drawCalls += 1;
  receipt.triangles += 1;
}

export function encodeFrame(
  device: GPUDevice,
  swapchain: GPUTextureView,
  pipelines: FramePipelines,
  targets: FrameTargets,
  scene: FrameScene,
  look: FrameLook,
  bloom: boolean,
  receipt: FrameReceipt,
  timer?: FrameTimer,
): void {
  receipt.drawCalls = 0;
  receipt.triangles = 0;
  const encoder = device.createCommandEncoder();

  const prepass = encoder.beginRenderPass(targets.prepass);
  prepass.setBindGroup(0, look.frame);
  prepass.setBindGroup(1, scene.bindGroup);
  prepass.setIndexBuffer(scene.indexBuffer, "uint32");
  prepass.setPipeline(pipelines.geometry.prepass);
  drawGeometry(prepass, scene.draws, false, receipt);
  prepass.end();

  const colour = encoder.beginRenderPass(targets.colour);
  colour.setBindGroup(0, look.frame);
  colour.setPipeline(pipelines.background);
  fullscreen(colour, receipt);
  colour.setBindGroup(1, scene.bindGroup);
  colour.setIndexBuffer(scene.indexBuffer, "uint32");
  colour.setPipeline(pipelines.geometry.opaque);
  drawGeometry(colour, scene.draws, false, receipt);
  colour.setPipeline(pipelines.geometry.translucent);
  drawGeometry(colour, scene.draws, true, receipt);
  colour.end();

  if (bloom) {
    const draws = encodeBloom(encoder, pipelines.bloom, targets.bloom, look.frame);
    receipt.drawCalls += draws;
    receipt.triangles += draws;
  }

  targets.tonemap.colorAttachments[0].view = swapchain;
  const tonemap = encoder.beginRenderPass(targets.tonemap);
  tonemap.setBindGroup(0, look.frame);
  tonemap.setBindGroup(1, targets.postBindGroup);
  tonemap.setPipeline(pipelines.tonemap);
  fullscreen(tonemap, receipt);
  tonemap.end();

  timer?.encode(encoder);
  device.queue.submit([encoder.finish()]);
  timer?.collect();
}

/** Pass descriptors for one target set; built once per resize, mutated per frame. */
export function describePasses(
  depth: GPUTextureView,
  colourMs: GPUTextureView,
  hdr: GPUTextureView,
  timer?: FrameTimer,
): Pick<FrameTargets, "prepass" | "colour" | "tonemap"> {
  return {
    prepass: {
      label: "prepass",
      timestampWrites: timer?.begin,
      colorAttachments: [],
      depthStencilAttachment: {
        view: depth,
        depthClearValue: DEPTH_CLEAR,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    },
    colour: {
      label: "colour",
      colorAttachments: [
        {
          view: colourMs,
          resolveTarget: hdr,
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "discard",
        },
      ],
      depthStencilAttachment: { view: depth, depthLoadOp: "load", depthStoreOp: "discard" },
    },
    tonemap: {
      label: "tonemap",
      timestampWrites: timer?.end,
      colorAttachments: [
        // The swapchain view is filled in every frame.
        { view: hdr, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" },
      ],
    },
  };
}
