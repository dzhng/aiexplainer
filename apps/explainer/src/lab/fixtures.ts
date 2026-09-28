/** JSON `FrameInput` fixtures for the lab (`src/lab/fixtures/<name>.json`). */
import {
  parseGlb,
  type FrameInput,
  type LookConfig,
  type MeshAsset,
  type OrbitPose,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  type ViewMode,
} from "@repo/renderer";
import type { LabelDef } from "../chapters/types.ts";
import { lookConfig, type MaterialToken } from "../look/look.ts";
import type { SceneRun } from "../scene/build-frame.ts";
import { ENVIRONMENT, withEnvironment } from "../scene/environment.ts";

export interface FixtureJson {
  camera: OrbitPose;
  view?: { mode: ViewMode; t: number };
  /** Lab-only swatch materials, added to the product presets. */
  materials?: Record<string, MaterialToken>;
  /** Prop URLs by asset id, e.g. `{ "board": "/props/counter_board.glb" }`. */
  assets?: Record<string, string>;
  parts: Part[];
  anchors?: SceneAnchor[];
  /** Fixture label text, one per anchor (the product's comes from `ChapterDef.labels`). */
  labels?: LabelDef[];
  /** Stands the fixture in the product's lab room, as every chapter scene is. */
  environment?: boolean;
}

export interface LabScene {
  look: LookConfig;
  input: Omit<FrameInput, "timeSec" | "viewport">;
  labels?: LabelDef[];
}

const runs = import.meta.glob<SceneRun>("./fixtures/runs/*.json", {
  eager: true,
  import: "default",
});

/** A chapter's committed run (`fixtures/runs/<slug>.json`, `scripts/scene-run.ts`), if any. */
export function fixtureRun(slug: string): SceneRun | null {
  return runs[`./fixtures/runs/${slug}.json`] ?? null;
}

const fixtures = import.meta.glob<FixtureJson>("./fixtures/*.json", {
  eager: true,
  import: "default",
});

export function fixtureNames(): string[] {
  return Object.keys(fixtures).map((path) => path.replace(/^.*\/(.*)\.json$/, "$1"));
}

export async function loadAsset(url: string): Promise<MeshAsset> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parseGlb(await response.arrayBuffer());
}

export function frameFromParts(
  camera: OrbitPose,
  parts: Part[],
  view: FrameInput["view"] = { mode: "whole", t: 0 },
  assets: SceneDesc["assets"] = {},
  anchors: SceneAnchor[] = [],
): LabScene["input"] {
  const slots = parts.reduce((n, p) => Math.max(n, p.slot + 1), 1);
  return {
    camera,
    view,
    scene: { revision: 1, parts, assets, anchors },
    dynamics: {
      intensity: new Float32Array(slots).fill(1),
      widthScale: new Float32Array(slots).fill(1),
      flowPhase: new Float32Array(slots),
    },
  };
}

export async function loadFixture(name: string): Promise<LabScene> {
  const fixture = fixtures[`./fixtures/${name}.json`];
  if (!fixture) throw new Error(`unknown fixture "${name}"; have ${fixtureNames().join(", ")}`);
  const assets: SceneDesc["assets"] = {};
  const urls = {
    ...fixture.assets,
    ...(fixture.environment && { [ENVIRONMENT.id]: ENVIRONMENT.url }),
  };
  for (const [id, url] of Object.entries(urls)) assets[id] = await loadAsset(url);
  const input = frameFromParts(
    structuredClone(fixture.camera),
    fixture.parts,
    fixture.view,
    assets,
    fixture.anchors,
  );
  if (fixture.environment) withEnvironment(input.scene);
  return { look: lookConfig(fixture.materials), input, labels: fixture.labels };
}
