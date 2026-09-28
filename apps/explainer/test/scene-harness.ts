/**
 * Shared helpers for chapter scene tests: a chapter's run through the same in-process
 * context the fixture script uses, and its frame at a loop time.
 */
import type { SceneDesc } from "@repo/renderer";
import path from "node:path";
import { shippedContext } from "../scripts/shipped.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import type { ChapterDef } from "../src/chapters/types.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import {
  buildFrame,
  createSceneFrame,
  type SceneFrame,
  type SceneRun,
  type SceneUi,
} from "../src/scene/build-frame.ts";

export { shippedModel } from "../scripts/shipped.ts";

/** A chapter's run as the app computes it, for its loop inputs or `text`. */
export async function chapterRun(def: ChapterDef, text: string | null = null): Promise<SceneRun> {
  if (!def.model) throw new Error(`${def.slug} has no model`);
  const run = await computeRun(def, text, await shippedContext(def.model));
  if (!run) throw new Error(`${def.slug} has no run`);
  return run;
}

/** The committed fixture run `/lab/scene/<slug>` draws. */
export async function fixtureRun(def: ChapterDef): Promise<SceneRun> {
  return Bun.file(
    path.resolve(import.meta.dirname, `../src/lab/fixtures/runs/${def.slug}.json`),
  ).json();
}

/** The chapter's scene at loop time `t`, with the controls at their defaults unless given. */
export function frameAt(
  def: ChapterDef,
  run: SceneRun | null,
  t: number,
  ui: Partial<SceneUi> = {},
  assets: SceneDesc["assets"] = {},
): { frame: SceneFrame; scene: SceneDesc; intensity: Float32Array } {
  const frame = createSceneFrame({
    camera: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5, fovY: 0.7 },
    view: { mode: "whole", t: 0 },
    scene: { revision: 0, parts: [], anchors: [], assets },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  });
  const tl = evalTimeline(def.loop, t, createTimelineState(def.loop));
  const full: SceneUi = {
    follow: null,
    slider: def.slider.initial,
    sliderSet: false,
    view: "whole",
    text: null,
    ...ui,
  };
  const input = buildFrame(def, tl, full, run, frame);
  return { frame, scene: input.scene, intensity: input.dynamics.intensity };
}
