/**
 * The backdrop: a full-screen triangle on the far plane (reverse-Z depth 0), drawn with the
 * `equal` test so it only shades where no geometry landed. It opens the colour pass, which
 * guarantees every tile is drawn into and therefore resolved (the Apple tile quirk).
 */
import { tgpu, type TgpuRoot } from "typegpu";
import { RoomUniform } from "../pack.ts";
import { createPipeline, DEPTH, frameLayout, HDR_FORMAT, SAMPLE_COUNT } from "../pipeline.ts";

export const roomLayout = tgpu.bindGroupLayout({ room: { uniform: RoomUniform } }).$idx(1);

const template = /* wgsl */ `
struct BackgroundOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> BackgroundOut {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  var out: BackgroundOut;
  out.position = vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(corner.x, 1.0 - corner.y);
  return out;
}

@fragment
fn fs(in: BackgroundOut) -> @location(0) vec4f {
  let room = roomLayout.$.room;
  return vec4f(mix(room.wallTop, room.wallBottom, in.uv.y), 1.0);
}
`;

export function createBackgroundPipeline(root: TgpuRoot): Promise<GPURenderPipeline> {
  return createPipeline(root, {
    label: "background",
    layouts: [frameLayout, roomLayout],
    template,
    externals: { roomLayout },
    depthStencil: DEPTH.prepassed,
    sampleCount: SAMPLE_COUNT,
    cullMode: "none",
    fragment: { entryPoint: "fs", targets: [{ format: HDR_FORMAT }] },
  });
}
