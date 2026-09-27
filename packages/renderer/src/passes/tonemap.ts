/**
 * Resolved HDR → swapchain. Until the tonemapper lands (slice 07) this clamps and applies
 * the sRGB transfer curve, because the swapchain format is not an sRGB format.
 */
import { d, tgpu, type TgpuRoot } from "typegpu";
import { createPipeline, frameLayout } from "../pipeline.ts";

export const postLayout = tgpu.bindGroupLayout({ hdr: { texture: d.texture2d(d.f32) } }).$idx(1);

const template = /* wgsl */ `
@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn linearToSrgb(c: vec3f) -> vec3f {
  let low = c * 12.92;
  let high = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, c <= vec3f(0.0031308));
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let hdr = textureLoad(postLayout.$.hdr, vec2i(position.xy), 0).rgb;
  return vec4f(linearToSrgb(clamp(hdr, vec3f(0.0), vec3f(1.0))), 1.0);
}
`;

export function createTonemapPipeline(
  root: TgpuRoot,
  format: GPUTextureFormat,
): Promise<GPURenderPipeline> {
  return createPipeline(root, {
    label: "tonemap",
    layouts: [frameLayout, postLayout],
    template,
    externals: { postLayout },
    cullMode: "none",
    fragment: { entryPoint: "fs", targets: [{ format }] },
  });
}
