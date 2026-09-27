/** JSON `FrameInput` fixtures for the lab (`src/lab/fixtures/<name>.json`). */
import type { FrameInput, LookConfig, OrbitPose, Part, SceneDesc, ViewMode } from "@repo/renderer";
import { lookConfig, type MaterialToken } from "../look/look.ts";

export interface FixtureJson {
  camera: OrbitPose;
  view?: { mode: ViewMode; t: number };
  /** Lab-only swatch materials, added to the product presets. */
  materials?: Record<string, MaterialToken>;
  parts: Part[];
}

const fixtures = import.meta.glob<FixtureJson>("./fixtures/*.json", {
  eager: true,
  import: "default",
});

export function fixtureNames(): string[] {
  return Object.keys(fixtures).map((path) => path.replace(/^.*\/(.*)\.json$/, "$1"));
}

export function frameFromParts(
  camera: OrbitPose,
  parts: Part[],
  view: FrameInput["view"] = { mode: "whole", t: 0 },
  assets: SceneDesc["assets"] = {},
): Omit<FrameInput, "timeSec" | "viewport"> {
  const slots = parts.reduce((n, p) => Math.max(n, p.slot + 1), 1);
  return {
    camera,
    view,
    scene: { revision: 1, parts, assets },
    dynamics: {
      intensity: new Float32Array(slots).fill(1),
      widthScale: new Float32Array(slots).fill(1),
      flowPhase: new Float32Array(slots),
    },
  };
}

export function loadFixture(name: string): {
  look: LookConfig;
  input: Omit<FrameInput, "timeSec" | "viewport">;
} {
  const fixture = fixtures[`./fixtures/${name}.json`];
  if (!fixture) throw new Error(`unknown fixture "${name}"; have ${fixtureNames().join(", ")}`);
  return {
    look: lookConfig(fixture.materials),
    input: frameFromParts(structuredClone(fixture.camera), fixture.parts, fixture.view),
  };
}
