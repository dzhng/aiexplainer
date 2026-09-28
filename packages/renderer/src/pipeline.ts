/**
 * Bind group layouts shared across passes, the engine-wide depth convention, and the one
 * helper that turns a WGSL template into a pipeline. Shaders are WGSL templates resolved by
 * TypeGPU, so structs and bindings come from the schemas in `pack.ts` rather than being
 * mirrored by hand. Every layout pins its group index, so raw encoding needs no lookup.
 */
import { d, tgpu, type TgpuBindGroupLayout, type TgpuRoot } from "typegpu";
import { FrameUniform, Instance, LookUniform, Material, Vertex } from "./pack.ts";

/** Group 0 in every pipeline: camera and time (per frame) and the look (per look change). */
export const frameLayout = tgpu
  .bindGroupLayout({ frame: { uniform: FrameUniform }, look: { uniform: LookUniform } })
  .$idx(0);

/** Group 1 in the geometry passes: the uploaded scene. */
export const sceneLayout = tgpu
  .bindGroupLayout({
    vertices: { storage: d.arrayOf(Vertex), access: "readonly" },
    instances: { storage: d.arrayOf(Instance), access: "readonly" },
    materials: { storage: d.arrayOf(Material), access: "readonly" },
    dynamics: { storage: d.arrayOf(d.vec4f), access: "readonly" },
  })
  .$idx(1);

export const HDR_FORMAT: GPUTextureFormat = "rgba16float";
export const SAMPLE_COUNT = 4;

/** Reverse-Z: cleared to 0 (far), nearer wins with `greater`. These change together or not at all. */
export const DEPTH_FORMAT: GPUTextureFormat = "depth32float";
export const DEPTH_CLEAR = 0;
export const DEPTH = {
  /** The prepass writes depth. */
  prepass: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "greater" },
  /** Colour after the prepass: only the exact prepassed surface shades. */
  prepassed: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "equal" },
  /** Translucent geometry reads depth and never writes it. */
  readOnly: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "greater" },
} as const satisfies Record<string, GPUDepthStencilState>;

export const PREMULTIPLIED_BLEND: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/**
 * Written text: premultiplied colour, and the HDR target's alpha (1 wherever the scene is
 * drawn: every earlier blend keeps it there) left at 1 − the letters' coverage, so the
 * tonemap can keep bloom off the letters.
 */
export const TEXT_BLEND: GPUBlendState = {
  color: PREMULTIPLIED_BLEND.color,
  alpha: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" },
};

export interface PipelineSpec {
  label: string;
  /** Layouts in group-index order. */
  layouts: TgpuBindGroupLayout[];
  template: string;
  externals: Record<string, object>;
  /** Omit for a depth-only pipeline. */
  fragment?: { entryPoint: string; targets: GPUColorTargetState[] };
  vertexEntry?: string;
  depthStencil?: GPUDepthStencilState;
  sampleCount?: number;
  cullMode?: GPUCullMode;
}

/** Resolves the template into a shader module and returns the pipeline descriptor. */
export function describePipeline(
  root: Pick<TgpuRoot, "unwrap" | "device">,
  spec: PipelineSpec,
): GPURenderPipelineDescriptor {
  const code = tgpu.resolve({ template: spec.template, externals: spec.externals });
  const module = root.device.createShaderModule({ label: spec.label, code });
  return {
    label: spec.label,
    layout: root.device.createPipelineLayout({
      label: spec.label,
      bindGroupLayouts: spec.layouts.map((layout) => root.unwrap(layout)),
    }),
    vertex: { module, entryPoint: spec.vertexEntry ?? "vs" },
    fragment: spec.fragment && { module, ...spec.fragment },
    primitive: { topology: "triangle-list", cullMode: spec.cullMode ?? "back" },
    depthStencil: spec.depthStencil,
    multisample: { count: spec.sampleCount ?? 1 },
  };
}

export function createPipeline(root: TgpuRoot, spec: PipelineSpec): Promise<GPURenderPipeline> {
  return root.device.createRenderPipelineAsync(describePipeline(root, spec));
}
