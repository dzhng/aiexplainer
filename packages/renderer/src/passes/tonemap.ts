/**
 * Resolved HDR plus bloom → swapchain: exposure, a corner vignette, then AgX (the Blender/Filament
 * operator, via three.js's polynomial fit) and the sRGB transfer curve, because the
 * swapchain format is not an sRGB format. Half a code value of ordered noise breaks up
 * banding in the dark gradients.
 */
import { d, tgpu, type TgpuRoot } from "typegpu";
import { createPipeline, frameLayout } from "../pipeline.ts";

export const postLayout = tgpu
  .bindGroupLayout({
    hdr: { texture: d.texture2d(d.f32) },
    bloom: { texture: d.texture2d(d.f32) },
    linear: { sampler: "filtering" },
  })
  .$idx(1);

const template = /* wgsl */ `
@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

const LINEAR_SRGB_TO_REC2020 = mat3x3f(
  vec3f(0.6274, 0.0691, 0.0164),
  vec3f(0.3293, 0.9195, 0.0880),
  vec3f(0.0433, 0.0113, 0.8956),
);
const REC2020_TO_LINEAR_SRGB = mat3x3f(
  vec3f(1.6605, -0.1246, -0.0182),
  vec3f(-0.5876, 1.1329, -0.1006),
  vec3f(-0.0728, -0.0083, 1.1187),
);
const AGX_INSET = mat3x3f(
  vec3f(0.856627153315983, 0.137318972929847, 0.11189821299995),
  vec3f(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
  vec3f(0.0482516061458583, 0.101439036467562, 0.811302368396859),
);
const AGX_OUTSET = mat3x3f(
  vec3f(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
  vec3f(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
  vec3f(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405),
);
const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

fn agx(linearSrgb: vec3f) -> vec3f {
  var c = AGX_INSET * (LINEAR_SRGB_TO_REC2020 * linearSrgb);
  c = clamp((log2(max(c, vec3f(1e-10))) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV), vec3f(0.0), vec3f(1.0));
  c = agxContrast(c);
  // AgX "look": saturation around luma, applied in the encoded space (1 = the base look).
  let luma = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = AGX_OUTSET * (luma + frameLayout.$.look.saturation * (c - luma));
  c = pow(max(c, vec3f(0.0)), vec3f(2.2));
  return clamp(REC2020_TO_LINEAR_SRGB * c, vec3f(0.0), vec3f(1.0));
}

fn linearToSrgb(c: vec3f) -> vec3f {
  let low = c * 12.92;
  let high = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, c <= vec3f(0.0031308));
}

/** Interleaved gradient noise (Jimenez 2014) in [0, 1). */
fn ditherNoise(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let look = frameLayout.$.look;
  let viewport = frameLayout.$.frame.viewport;
  let uv = position.xy * viewport.zw;
  let bloom = textureSampleLevel(postLayout.$.bloom, postLayout.$.linear, uv, 0.0).rgb;
  let hdr = textureLoad(postLayout.$.hdr, vec2i(position.xy), 0).rgb
    + bloom * look.bloomIntensity * frameLayout.$.frame.debug.y;
  // 0 at the centre, 1 at the corners.
  let r = length(uv * 2.0 - 1.0) * 0.70710678;
  let vignette = 1.0 - look.vignetteStrength * smoothstep(look.vignetteRadius, 1.0, r);
  let display = linearToSrgb(agx(hdr * look.exposure * vignette));
  return vec4f(display + (ditherNoise(position.xy) - 0.5) / 255.0, 1.0);
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
    externals: { frameLayout, postLayout },
    cullMode: "none",
    fragment: { entryPoint: "fs", targets: [{ format }] },
  });
}
