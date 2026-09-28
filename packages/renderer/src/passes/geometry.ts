/**
 * Scene geometry: vertices are pulled from storage by index, instances by instance index.
 * Each vertex's distance from its axis point is scaled by its part slot's widthScale, so a
 * tube's radius follows `widthScale` (every other part's axis is the vertex itself).
 * The depth prepass and both colour variants share this one vertex stage, whose position
 * is `@invariant`, so the `equal` depth test in the colour pass matches bit for bit.
 *
 * The Cutaway view is a fragment-stage clip: an instance with `cut > 0` discards what lies
 * past the cut plane (swept in from `CUT_TRAVEL` beyond it as `cut` goes 0 → 1), in the
 * prepass and colour pass alike. Only while cutting, the frame swaps in the `*Cut` variants:
 * a prepass with a discard-only fragment stage, and no culling, so through the cut the
 * inside of a closed part shows its back faces, painted the look's flat cap colour: the cut
 * face. Whole and Exploded keep the fragment-less prepass and back-face culling.
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
  @location(3) ao: f32,
  @location(4) light: vec2f,
  @location(5) along: f32,
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOut {
  let vertex = sceneLayout.$.vertices[vertexIndex];
  let instance = sceneLayout.$.instances[instanceIndex];
  // widthScale multiplies the part's width about its axis (a tube's radius).
  let widthScale = max(sceneLayout.$.dynamics[instance.slot].y, 0.0);
  let local = vertex.axis + (vertex.position - vertex.axis) * widthScale;
  let world = instance.model * vec4f(local, 1.0);
  var out: VertexOut;
  out.position = frameLayout.$.frame.viewProj * world;
  out.worldPos = world.xyz;
  out.normal = instance.normalMatrix * vertex.normal;
  out.instance = instanceIndex;
  out.ao = vertex.ao;
  out.light = unpack2x16unorm(vertex.light);
  out.along = vertex.along;
  return out;
}

${LIGHTING_WGSL}

/** Metres beyond the plane the cut starts from, so a cut of 0 removes nothing. */
const CUT_TRAVEL = 4.0;

/** Whether the Cutaway plane removes this fragment of the instance. */
fn cutAway(instance: u32, worldPos: vec3f) -> bool {
  let cut = sceneLayout.$.instances[instance].cut;
  let plane = frameLayout.$.frame.cutPlane;
  return cut > 0.0 && dot(plane.xyz, worldPos) > plane.w + (1.0 - cut) * CUT_TRAVEL;
}

/**
 * A flow pulse's brightness at this fragment, or 0 off the pulses: dashes along the part,
 * \`flowSpacing\` apart and \`flowDuty\` of that long, moved on by the slot's flow phase (in
 * spacings). Within a dash the light swells toward its leading end and fades at both ends,
 * so it reads as a glow travelling, not a solid bead.
 */
fn pulse(along: f32, slot: u32) -> f32 {
  let look = frameLayout.$.look;
  let phase = fract(along / look.flowSpacing - sceneLayout.$.dynamics[slot].z);
  if (phase >= look.flowDuty) {
    return 0.0;
  }
  let u = phase / look.flowDuty;
  return smoothstep(0.0, 0.8, u) * (1.0 - smoothstep(0.8, 1.0, u));
}

/** Depth prepass: only the cut needs a fragment stage (no colour target). */
@fragment
fn fsDepth(in: VertexOut) {
  if (cutAway(in.instance, in.worldPos)) {
    discard;
  }
}

@fragment
fn fs(in: VertexOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  if (cutAway(in.instance, in.worldPos)) {
    discard;
  }
  let instance = sceneLayout.$.instances[in.instance];
  let material = sceneLayout.$.materials[instance.material];
  let v = normalize(frameLayout.$.frame.eye.xyz - in.worldPos);
  if (instance.cut > 0.0 && !frontFacing) {
    // Seen through the cut: the part's inside, capped flat as if it were the cut face.
    let cap = frameLayout.$.look.capColor;
    let n = -normalize(frameLayout.$.frame.cutPlane.xyz);
    let capShading = shadeSurface(Surface(cap, 0.0, 0.85, 1.0, vec2f(0.0)), n, v, in.worldPos);
    return vec4f(capShading.diffuse + capShading.specular, 1.0);
  }
  if (material.pulses > 0.5) {
    // Flow pulses only add light: nothing between the dashes, no surface of their own.
    let lit = pulse(in.along, instance.slot) * frameLayout.$.frame.debug.z;
    if (lit <= 0.0) {
      discard;
    }
    return vec4f(material.emissive * sceneLayout.$.dynamics[instance.slot].x * lit, 0.0);
  }
  // Emission is scaled per part slot by the frame's dynamics (and zeroed by the debug layer).
  let emitted = material.emissive * sceneLayout.$.dynamics[instance.slot].x * frameLayout.$.frame.debug.x;
  let n = select(-1.0, 1.0, frontFacing) * normalize(in.normal);
  let surface = Surface(material.baseColor, material.metallic, material.roughness, in.ao, in.light);
  var shading = shadeSurface(surface, n, v, in.worldPos);
  shading.specular *= material.specular;
  if (material.opacity >= 1.0) {
    return vec4f(shading.diffuse + shading.specular + emitted, 1.0);
  }
  // Clear glass: no diffuse. It absorbs by its opacity, more toward grazing angles
  // (Fresnel), and reflects the lights on top (premultiplied, so reflections never fade).
  // A translucent surface's vertex AO is its coverage (1 for glass; a contact shadow's soft
  // footprint fades to 0 at its edge).
  let edge = fresnelSchlick(vec3f(0.04), max(dot(n, v), 0.0)).x;
  return vec4f(shading.specular + emitted, mix(material.opacity, 1.0, edge)) * in.ao;
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
  prepassCut: {
    ...base,
    label: "geometry.prepassCut",
    depthStencil: DEPTH.prepass,
    cullMode: "none",
    fragment: { entryPoint: "fsDepth", targets: [] },
  },
  opaqueCut: {
    ...base,
    label: "geometry.opaqueCut",
    depthStencil: DEPTH.prepassed,
    cullMode: "none",
    fragment: { entryPoint: "fs", targets: [{ format: HDR_FORMAT }] },
  },
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

export type GeometryPipelines = Record<keyof typeof GEOMETRY_PIPELINES, GPURenderPipeline>;

export async function createGeometryPipelines(root: TgpuRoot): Promise<GeometryPipelines> {
  const names = Object.keys(GEOMETRY_PIPELINES) as (keyof typeof GEOMETRY_PIPELINES)[];
  const pipelines = await Promise.all(
    names.map((name) => createPipeline(root, GEOMETRY_PIPELINES[name])),
  );
  return Object.fromEntries(names.map((name, i) => [name, pipelines[i]!])) as GeometryPipelines;
}
