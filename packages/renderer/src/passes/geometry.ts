/**
 * Scene geometry: vertices are pulled from storage by index, instances by instance index.
 * The depth prepass and both colour variants share this one vertex stage, whose position
 * is `@invariant`, so the `equal` depth test in the colour pass matches bit for bit.
 */
import type { TgpuRoot } from "typegpu";
import { LIGHTING_WGSL } from "./lighting.ts";
import {
  createPipeline,
  DEPTH,
  frameLayout,
  HDR_FORMAT,
  PREMULTIPLIED_BLEND,
  SAMPLE_COUNT,
  sceneLayout,
  type PipelineSpec,
} from "../pipeline.ts";

const template = /* wgsl */ `
struct VertexOut {
  @invariant @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) @interpolate(flat) instance: u32,
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOut {
  let vertex = sceneLayout.$.vertices[vertexIndex];
  let instance = sceneLayout.$.instances[instanceIndex];
  let world = instance.model * vec4f(vertex.position, 1.0);
  var out: VertexOut;
  out.position = frameLayout.$.frame.viewProj * world;
  out.worldPos = world.xyz;
  out.normal = instance.normalMatrix * vertex.normal;
  out.instance = instanceIndex;
  return out;
}

${LIGHTING_WGSL}

@fragment
fn fs(in: VertexOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  let instance = sceneLayout.$.instances[in.instance];
  let material = sceneLayout.$.materials[instance.material];
  let v = normalize(frameLayout.$.frame.eye.xyz - in.worldPos);
  // Emission is scaled per part slot by the frame's dynamics (and zeroed by the debug layer).
  let emitted = material.emissive * sceneLayout.$.dynamics[instance.slot].x * frameLayout.$.frame.debug.x;
  let n = select(-1.0, 1.0, frontFacing) * normalize(in.normal);
  let shading = shadeSurface(Surface(material.baseColor, material.metallic, material.roughness), n, v);
  if (material.opacity >= 1.0) {
    return vec4f(shading.diffuse + shading.specular + emitted, 1.0);
  }
  // Clear glass: no diffuse. It absorbs by its opacity, more toward grazing angles
  // (Fresnel), and reflects the lights on top (premultiplied, so reflections never fade).
  let edge = fresnelSchlick(vec3f(0.04), max(dot(n, v), 0.0)).x;
  return vec4f(shading.specular + emitted, mix(material.opacity, 1.0, edge));
}
`;

const base = {
  layouts: [frameLayout, sceneLayout],
  template,
  externals: { frameLayout, sceneLayout },
  sampleCount: SAMPLE_COUNT,
} satisfies Partial<PipelineSpec>;

/** The three geometry pipelines' fixed state, exported so tests can inspect the contract. */
export const GEOMETRY_PIPELINES = {
  prepass: { ...base, label: "geometry.prepass", depthStencil: DEPTH.prepass },
  opaque: {
    ...base,
    label: "geometry.opaque",
    depthStencil: DEPTH.prepassed,
    fragment: { entryPoint: "fs", targets: [{ format: HDR_FORMAT }] },
  },
  translucent: {
    ...base,
    label: "geometry.translucent",
    depthStencil: DEPTH.readOnly,
    cullMode: "none",
    fragment: { entryPoint: "fs", targets: [{ format: HDR_FORMAT, blend: PREMULTIPLIED_BLEND }] },
  },
} satisfies Record<string, PipelineSpec>;

export interface GeometryPipelines {
  prepass: GPURenderPipeline;
  opaque: GPURenderPipeline;
  translucent: GPURenderPipeline;
}

export async function createGeometryPipelines(root: TgpuRoot): Promise<GeometryPipelines> {
  const [prepass, opaque, translucent] = await Promise.all([
    createPipeline(root, GEOMETRY_PIPELINES.prepass),
    createPipeline(root, GEOMETRY_PIPELINES.opaque),
    createPipeline(root, GEOMETRY_PIPELINES.translucent),
  ]);
  return { prepass, opaque, translucent };
}
