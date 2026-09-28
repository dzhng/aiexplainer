import type { LightLook, LookConfig } from "../src/frame-input.ts";

/** A complete look for tests; the values are arbitrary but valid. */
export function testLook(): LookConfig {
  const light: LightLook = { direction: [0, 1, 0], radiance: [1, 1, 1] };
  return {
    room: {
      wallTop: [0, 0, 0.01],
      wallBottom: [0.01, 0.01, 0.02],
      ao: 1,
      bake: { warm: [1, 0.8, 0.6], cool: [0.5, 0.6, 1] },
      reflection: 1,
      vignette: { strength: 0.3, radius: 0.5 },
    },
    lights: {
      key: light,
      rim: light,
      fill: light,
      size: 0.05,
      pool: { center: [0, 0, 0], radius: 4, falloff: 4, spill: 0.2, stretch: 1 },
    },
    ambient: [0.02, 0.02, 0.03],
    materials: {
      metal: {
        baseColor: [0.2, 0.2, 0.3],
        metallic: 0.8,
        roughness: 0.3,
        opacity: 1,
        emissive: [0, 0, 0],
      },
      glass: {
        baseColor: [0.2, 0.4, 0.9],
        metallic: 0,
        roughness: 0.1,
        opacity: 0.3,
        emissive: [0, 0, 0],
      },
      shadow: {
        baseColor: [0, 0, 0],
        metallic: 0,
        roughness: 1,
        opacity: 0.7,
        emissive: [0, 0, 0],
      },
      floor: {
        baseColor: [0.01, 0.01, 0.02],
        metallic: 0,
        roughness: 0.8,
        opacity: 1,
        emissive: [0, 0, 0],
      },
    },
    tonemap: { exposure: 1, saturation: 1 },
    bloom: { threshold: 1, knee: 0.5, intensity: 0.1, radius: 1 },
    flow: { spacing: 0.25, duty: 0.4 },
  };
}
