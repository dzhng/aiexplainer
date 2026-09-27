import type { LightLook, LookConfig } from "../src/frame-input.ts";

/** A complete look for tests; the values are arbitrary but valid. */
export function testLook(): LookConfig {
  const light: LightLook = { direction: [0, 1, 0], radiance: [1, 1, 1] };
  return {
    room: {
      wallTop: [0, 0, 0.01],
      wallBottom: [0.01, 0.01, 0.02],
      radius: 10,
      floorFade: 0.4,
      reflection: 1,
      vignette: { strength: 0.3, radius: 0.5 },
    },
    lights: { key: light, rim: light, fill: light, size: 0.05 },
    ambient: [0.02, 0.02, 0.03],
    materials: {
      metal: { baseColor: [0.2, 0.2, 0.3], metallic: 0.8, roughness: 0.3, opacity: 1 },
      glass: { baseColor: [0.2, 0.4, 0.9], metallic: 0, roughness: 0.1, opacity: 0.3 },
      floor: { baseColor: [0.01, 0.01, 0.02], metallic: 0, roughness: 0.8, opacity: 1 },
    },
    tonemap: { exposure: 1 },
  };
}
