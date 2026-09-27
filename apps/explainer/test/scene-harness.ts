/**
 * Shared helpers for chapter scene tests: the shipped models through the same in-process
 * session the fixture script uses, and a chapter's frame at a loop time.
 */
import { fetchModel, type LoadedModel, type ModelId } from "@repo/llm";
import type { SceneDesc } from "@repo/renderer";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import type { ChapterDef } from "../src/chapters/types.ts";
import { localSession } from "../src/runtime/local-session.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import {
  buildFrame,
  createSceneFrame,
  type SceneFrame,
  type SceneRun,
  type SceneUi,
} from "../src/scene/build-frame.ts";

export const publicDir = path.resolve(import.meta.dirname, "../public");
export const modelsUrl = pathToFileURL(path.join(publicDir, "models/"));

export function shippedModel(id: ModelId): Promise<LoadedModel> {
  return fetchModel(new URL(`${id}/manifest.json`, modelsUrl));
}

/** A chapter's run as the app computes it, for its loop inputs or `text`. */
export async function chapterRun(def: ChapterDef, text: string | null = null): Promise<SceneRun> {
  if (!def.model) throw new Error(`${def.slug} has no model`);
  const session = localSession(modelsUrl);
  await session.load(def.model);
  const run = await computeRun(def, text, session, await shippedModel(def.model));
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
    view: "whole",
    text: null,
    ...ui,
  };
  const input = buildFrame(def, tl, full, run, frame);
  return { frame, scene: input.scene, intensity: input.dynamics.intensity };
}
