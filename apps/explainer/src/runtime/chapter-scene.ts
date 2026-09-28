/**
 * A chapter's scene on the stage: loads its builder's props, and gives the stage an `update`
 * that runs the chapter loop at the caller's loop time through `evalTimeline` → `buildFrame`.
 * The app (with its HUD and loop clock) and `/lab/scene/<slug>` (held time, fixture run)
 * both use it, so a scene reviewed in the lab is the scene the app draws.
 */
import { parseGlb, type FrameInput, type OrbitPose, type SceneDesc } from "@repo/renderer";
import { createTimelineState, evalTimeline, type TimelineState } from "../chapters/timeline.ts";
import type { ChapterDef } from "../chapters/types.ts";
import {
  buildFrame,
  createSceneFrame,
  SCENE_BUILDERS,
  type SceneFrame,
  type SceneRun,
  type SceneUi,
} from "../scene/build-frame.ts";
import { ENVIRONMENT } from "../scene/environment.ts";
import { shotPose } from "../scene/shots.ts";
import { ViewTransition } from "../scene/views.ts";
import { arrivalPose } from "./arrival.ts";
import { motionClock } from "./clock.ts";
import { cutPlane, look } from "../look/look.ts";

export interface ChapterSceneState {
  def: ChapterDef;
  ui: SceneUi;
  run: SceneRun | null;
  /** Seconds into the chapter's loop. */
  loopTime: number;
}

const loaded = new Map<string, Promise<SceneDesc["assets"][string]>>();

/** Loads (once per URL) the room and every prop the chapter's scene builder needs into `assets`. */
export async function loadSceneAssets(def: ChapterDef, assets: SceneDesc["assets"]): Promise<void> {
  const wanted = Object.entries({
    ...SCENE_BUILDERS[def.scene].assets,
    [ENVIRONMENT.id]: ENVIRONMENT.url,
  });
  await Promise.all(
    wanted.map(async ([id, url]) => {
      if (!loaded.has(url))
        loaded.set(
          url,
          fetch(url).then(async (response) => {
            if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
            return parseGlb(await response.arrayBuffer());
          }),
        );
      assets[id] = await loaded.get(url)!;
    }),
  );
}

export interface ChapterScene {
  frame: SceneFrame;
  /** The loop's time and beat as of the last update. */
  beat(): { t: number; id: string; note: string } | null;
  /** The stage's first frame input: the chapter's shot, an empty scene until the first update. */
  input: Omit<FrameInput, "timeSec" | "viewport">;
  update: (input: FrameInput) => void;
}

export function chapterScene(
  first: ChapterDef,
  assets: SceneDesc["assets"],
  state: () => ChapterSceneState,
): ChapterScene {
  const input: ChapterScene["input"] = {
    camera: shotPose(first.shot),
    view: { mode: first.views[0] ?? "whole", t: 0 },
    // The room shows from the first frame (the stage starts once `loadSceneAssets` is done).
    scene: { revision: 0, parts: [], anchors: [], assets, environment: ENVIRONMENT.id },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  };
  const frame = createSceneFrame(input);
  let timelineFor: ChapterDef | null = null;
  let tl: TimelineState | null = null;
  // View changes are UI motion on the wall clock, not loop time: they ease in even while a
  // lab page holds the loop clock, and a page that opens in a view starts settled in it.
  let views: ViewTransition | null = null;
  let lastSec = motionClock.now();
  // The reader's camera, kept while a pull-back eases away from it.
  const held: OrbitPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1, fovY: 1 };
  return {
    frame,
    input,
    beat() {
      const beat = tl && timelineFor ? timelineFor.loop.beats[tl.beat] : undefined;
      return beat && tl ? { t: tl.t, id: beat.id, note: beat.note } : null;
    },
    update(stageInput) {
      const { def, ui, run, loopTime } = state();
      // The builder needs its props; until they arrive the previous scene stays up.
      if (Object.keys(SCENE_BUILDERS[def.scene].assets).some((id) => !assets[id])) return;
      if (timelineFor !== def || !tl) {
        tl = createTimelineState(def.loop);
        timelineFor = def;
        views = new ViewTransition(ui.view);
      }
      evalTimeline(def.loop, loopTime, tl);
      frame.input = stageInput;
      buildFrame(def, tl, ui, run, frame);
      const now = motionClock.now();
      views!.step(ui.view, now - lastSec, look.views.durationSec, stageInput.view);
      lastSec = now;
      stageInput.view.cut = cutPlane(def.scene);
      // The chapter's one zoom-out (D5): ease the camera toward its wide shot and back.
      const pull = def.pullBack ? (tl.channels[def.pullBack.channel] ?? 0) : 0;
      if (def.pullBack && pull > 0) {
        const from = stageInput.camera;
        held.target = [from.target[0], from.target[1], from.target[2]];
        held.yaw = from.yaw;
        held.pitch = from.pitch;
        held.distance = from.distance;
        held.fovY = from.fovY;
        arrivalPose(held, shotPose(def.pullBack.shot), pull, from);
      }
    },
  };
}
