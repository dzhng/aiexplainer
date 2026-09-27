/**
 * The backdrop: a full-screen triangle on the far plane (reverse-Z depth 0), drawn with the
 * `equal` test so it only shades where nothing else will. It opens the colour pass, which
 * guarantees every tile is drawn into and therefore resolved (the Apple tile quirk). With
 * an environment room it only shows through gaps (and nowhere from inside the room).
 */
import type { TgpuRoot } from "typegpu";
import { createPipeline, DEPTH, frameLayout, HDR_FORMAT, SAMPLE_COUNT } from "../pipeline.ts";

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
  let look = frameLayout.$.look;
  return vec4f(mix(look.wallTop, look.wallBottom, in.uv.y), 1.0);
}
`;

export function createBackgroundPipeline(root: TgpuRoot): Promise<GPURenderPipeline> {
  return createPipeline(root, {
    label: "background",
    layouts: [frameLayout],
    template,
    externals: { frameLayout },
    depthStencil: DEPTH.prepassed,
    sampleCount: SAMPLE_COUNT,
    cullMode: "none",
    fragment: { entryPoint: "fs", targets: [{ format: HDR_FORMAT }] },
  });
}
