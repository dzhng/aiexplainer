/**
 * The Night-lab room, drawn as world geometry: a lit floor disc that fades into a wall
 * cylinder carrying the back-wall gradient. It shades after the backdrop with depth
 * `greater` and no depth write, so it only fills pixels no prepassed part is nearer in.
 */
import { d, tgpu, type TgpuRoot } from "typegpu";
import type { Geometry } from "../kit/geometry.ts";
import { Vertex } from "../pack.ts";
import { createPipeline, DEPTH, frameLayout, HDR_FORMAT, SAMPLE_COUNT } from "../pipeline.ts";
import { LIGHTING_WGSL } from "./lighting.ts";

export const roomLayout = tgpu
  .bindGroupLayout({ vertices: { storage: d.arrayOf(Vertex), access: "readonly" } })
  .$idx(1);

const SEGMENTS = 96;

/** Floor disc (normals up) and wall cylinder (normals inward) of `radius`, wall as tall as wide. */
export function roomGeometry(radius: number): Geometry {
  const ring = SEGMENTS;
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const indices: number[] = [];
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < ring; i++) indices.push(0, 1 + ((i + 1) % ring), 1 + i);
  const wall = positions.length / 3;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const [x, z] = [Math.cos(a), Math.sin(a)];
    positions.push(x * radius, 0, z * radius, x * radius, radius, z * radius);
    normals.push(-x, 0, -z, -x, 0, -z);
  }
  for (let i = 0; i < ring; i++) {
    const a = wall + i * 2;
    const b = wall + ((i + 1) % ring) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    bounds: [-radius, 0, -radius, radius, radius, radius],
  };
}

const template = /* wgsl */ `
struct RoomOut {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> RoomOut {
  let vertex = roomLayout.$.vertices[index];
  var out: RoomOut;
  out.position = frameLayout.$.frame.viewProj * vec4f(vertex.position, 1.0);
  out.worldPos = vertex.position;
  out.normal = vertex.normal;
  return out;
}

${LIGHTING_WGSL}

@fragment
fn fs(in: RoomOut) -> @location(0) vec4f {
  let look = frameLayout.$.look;
  if (in.normal.y > 0.5) {
    let v = normalize(frameLayout.$.frame.eye.xyz - in.worldPos);
    let shading = shadeSurface(Surface(look.floorColor, 0.0, look.floorRoughness), vec3f(0.0, 1.0, 0.0), v);
    let lit = shading.diffuse + shading.specular;
    let fade = smoothstep(0.0, look.floorFade, length(in.worldPos.xz) / look.roomRadius);
    return vec4f(mix(lit, look.wallBottom, fade), 1.0);
  }
  let height = smoothstep(0.0, look.roomRadius * 0.6, in.worldPos.y);
  return vec4f(mix(look.wallBottom, look.wallTop, height), 1.0);
}
`;

export function createRoomPipeline(root: TgpuRoot): Promise<GPURenderPipeline> {
  return createPipeline(root, {
    label: "room",
    layouts: [frameLayout, roomLayout],
    template,
    externals: { frameLayout, roomLayout },
    depthStencil: DEPTH.readOnly,
    sampleCount: SAMPLE_COUNT,
    fragment: { entryPoint: "fs", targets: [{ format: HDR_FORMAT }] },
  });
}
