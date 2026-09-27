/**
 * Physically based bloom (Jimenez 2014, "Next generation post processing in Call of Duty:
 * Advanced Warfare"; LearnOpenGL "Physically Based Bloom"), run between the resolve and the
 * tonemap:
 *   1. prefilter: a 13-tap downsample of the HDR target with Karis-averaged boxes (no
 *      fireflies), then a soft-knee threshold, into mip 0 of a half-resolution chain;
 *   2. downsample: the same 13-tap filter, mip by mip, down the chain;
 *   3. upsample: a 3×3 tent, added (blend one + one) into each level above.
 * The tonemap composites mip 0. The chain is size-dependent and lives in the targets scope.
 */
import { d, tgpu, type TgpuRoot } from "typegpu";
import { createPipeline, frameLayout, HDR_FORMAT } from "../pipeline.ts";

export const BLOOM_MAX_MIPS = 5;

/** Group 1 of every bloom pass: the level it reads. */
export const bloomSourceLayout = tgpu
  .bindGroupLayout({ source: { texture: d.texture2d(d.f32) }, linear: { sampler: "filtering" } })
  .$idx(1);

/** Mip count for a chain whose mip 0 is `width × height`: stop before a level gets tiny. */
export function bloomMipCount(width: number, height: number): number {
  const levels = Math.floor(Math.log2(Math.max(1, Math.min(width, height)))) - 1;
  return Math.max(1, Math.min(BLOOM_MAX_MIPS, levels));
}

const fullscreen = /* wgsl */ `
struct BloomOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> BloomOut {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  var out: BloomOut;
  out.position = vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(corner.x, 1.0 - corner.y);
  return out;
}

fn tap(uv: vec2f, offset: vec2f, texel: vec2f) -> vec3f {
  return textureSampleLevel(bloomSourceLayout.$.source, bloomSourceLayout.$.linear, uv + offset * texel, 0.0).rgb;
}

fn sourceTexel() -> vec2f {
  return 1.0 / vec2f(textureDimensions(bloomSourceLayout.$.source));
}

fn luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
`;

const downsample = /* wgsl */ `
${fullscreen}

// Jimenez's 13 taps: five overlapping 2×2 boxes. With Karis weighting each box is weighted
// by 1 / (1 + luma), which stops single hot pixels from blooming into flickering blobs.
fn downsample13(uv: vec2f, karis: bool) -> vec3f {
  let t = sourceTexel();
  let a = tap(uv, vec2f(-2.0, -2.0), t);
  let b = tap(uv, vec2f(0.0, -2.0), t);
  let c = tap(uv, vec2f(2.0, -2.0), t);
  let dd = tap(uv, vec2f(-2.0, 0.0), t);
  let e = tap(uv, vec2f(0.0, 0.0), t);
  let f = tap(uv, vec2f(2.0, 0.0), t);
  let g = tap(uv, vec2f(-2.0, 2.0), t);
  let h = tap(uv, vec2f(0.0, 2.0), t);
  let i = tap(uv, vec2f(2.0, 2.0), t);
  let j = tap(uv, vec2f(-1.0, -1.0), t);
  let k = tap(uv, vec2f(1.0, -1.0), t);
  let l = tap(uv, vec2f(-1.0, 1.0), t);
  let m = tap(uv, vec2f(1.0, 1.0), t);
  var boxes = array<vec3f, 5>(
    (j + k + l + m) * 0.25,
    (a + b + dd + e) * 0.25,
    (b + c + e + f) * 0.25,
    (dd + e + g + h) * 0.25,
    (e + f + h + i) * 0.25,
  );
  var weights = array<f32, 5>(0.5, 0.125, 0.125, 0.125, 0.125);
  var sum = vec3f(0.0);
  var total = 0.0;
  for (var n = 0u; n < 5u; n++) {
    let w = weights[n] * select(1.0, 1.0 / (1.0 + luma(boxes[n])), karis);
    sum += boxes[n] * w;
    total += w;
  }
  return sum / total;
}

@fragment
fn prefilter(in: BloomOut) -> @location(0) vec4f {
  let colour = downsample13(in.uv, true);
  let look = frameLayout.$.look;
  // Soft-knee threshold on the brightest channel.
  let brightness = max(colour.r, max(colour.g, colour.b));
  var soft = clamp(brightness - look.bloomThreshold + look.bloomKnee, 0.0, 2.0 * look.bloomKnee);
  soft = soft * soft / (4.0 * look.bloomKnee + 1e-4);
  let contribution = max(soft, brightness - look.bloomThreshold) / max(brightness, 1e-4);
  return vec4f(colour * contribution, 1.0);
}

@fragment
fn down(in: BloomOut) -> @location(0) vec4f {
  return vec4f(downsample13(in.uv, false), 1.0);
}
`;

const upsample = /* wgsl */ `
${fullscreen}

@fragment
fn up(in: BloomOut) -> @location(0) vec4f {
  let t = sourceTexel() * frameLayout.$.look.bloomRadius;
  let e = tap(in.uv, vec2f(0.0, 0.0), t) * 4.0;
  let cross = tap(in.uv, vec2f(0.0, -1.0), t) + tap(in.uv, vec2f(-1.0, 0.0), t) + tap(in.uv, vec2f(1.0, 0.0), t) + tap(in.uv, vec2f(0.0, 1.0), t);
  let diagonal = tap(in.uv, vec2f(-1.0, -1.0), t) + tap(in.uv, vec2f(1.0, -1.0), t) + tap(in.uv, vec2f(-1.0, 1.0), t) + tap(in.uv, vec2f(1.0, 1.0), t);
  return vec4f((e + cross * 2.0 + diagonal) / 16.0, 1.0);
}
`;

const ADD: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
};

export interface BloomPipelines {
  prefilter: GPURenderPipeline;
  down: GPURenderPipeline;
  up: GPURenderPipeline;
}

export async function createBloomPipelines(root: TgpuRoot): Promise<BloomPipelines> {
  const base = {
    layouts: [frameLayout, bloomSourceLayout],
    externals: { frameLayout, bloomSourceLayout },
    cullMode: "none" as const,
  };
  const [prefilter, down, up] = await Promise.all([
    createPipeline(root, {
      ...base,
      label: "bloom.prefilter",
      template: downsample,
      fragment: { entryPoint: "prefilter", targets: [{ format: HDR_FORMAT }] },
    }),
    createPipeline(root, {
      ...base,
      label: "bloom.down",
      template: downsample,
      fragment: { entryPoint: "down", targets: [{ format: HDR_FORMAT }] },
    }),
    createPipeline(root, {
      ...base,
      label: "bloom.up",
      template: upsample,
      fragment: { entryPoint: "up", targets: [{ format: HDR_FORMAT, blend: ADD }] },
    }),
  ]);
  return { prefilter, down, up };
}

/** One step of the chain: read `source`, draw into `target`. */
export interface BloomStep {
  source: GPUBindGroup;
  pass: GPURenderPassDescriptor;
}

/** The encoded chain for one target size: prefilter, downsamples, then upsamples. */
export interface BloomChain {
  prefilter: BloomStep;
  down: BloomStep[];
  up: BloomStep[];
}

function encodeStep(
  encoder: GPUCommandEncoder,
  pipeline: GPURenderPipeline,
  step: BloomStep,
  frame: GPUBindGroup,
): void {
  const pass = encoder.beginRenderPass(step.pass);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, frame);
  pass.setBindGroup(1, step.source);
  pass.draw(3);
  pass.end();
}

/** Encodes the whole chain; returns the number of draws. */
export function encodeBloom(
  encoder: GPUCommandEncoder,
  pipelines: BloomPipelines,
  chain: BloomChain,
  frame: GPUBindGroup,
): number {
  encodeStep(encoder, pipelines.prefilter, chain.prefilter, frame);
  for (const step of chain.down) encodeStep(encoder, pipelines.down, step, frame);
  for (const step of chain.up) encodeStep(encoder, pipelines.up, step, frame);
  return 1 + chain.down.length + chain.up.length;
}

/**
 * Pass descriptors and source bind groups for a chain over `mips` single-level views
 * (render and sampled) of one texture; `hdr` is the prefilter's source.
 */
export function describeBloomChain(
  hdr: GPUBindGroup,
  mips: { render: GPUTextureView; source: GPUBindGroup }[],
): BloomChain {
  const pass = (view: GPUTextureView, loadOp: GPULoadOp): GPURenderPassDescriptor => ({
    label: "bloom",
    colorAttachments: [{ view, clearValue: [0, 0, 0, 1], loadOp, storeOp: "store" }],
  });
  return {
    prefilter: { source: hdr, pass: pass(mips[0]!.render, "clear") },
    down: mips
      .slice(1)
      .map((mip, i) => ({ source: mips[i]!.source, pass: pass(mip.render, "clear") })),
    up: mips
      .slice(1)
      .map((mip, i) => ({ source: mip.source, pass: pass(mips[i]!.render, "load") }))
      .reverse(),
  };
}
