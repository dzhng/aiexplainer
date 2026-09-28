/**
 * `/lab/perf?fixture=board-room`, or `/lab/perf?scene=<slug>&t=<loop time>` for a chapter's
 * scene on its fixture run (the camera at its shot, or its tour's pose): whole-frame GPU time
 * with a feature on vs off (`&toggle=bloom`, the default, or `&toggle=text` for the written
 * text), interleaved in short alternating blocks on one renderer so machine load hits both
 * equally. Readback lags a few frames, so each block's first frames are dropped. Results go
 * to `probe.results`, which `verify.ts` prints; judging them against the budget is the
 * reader's call.
 */
import { createRenderer, Layer, type FrameInput, type SceneDesc } from "@repo/renderer";
import { CHAPTERS } from "../chapters/index.ts";
import type { ChapterSlug } from "../chapters/ladder.ts";
import { createTimelineState, evalTimeline } from "../chapters/timeline.ts";
import { lookConfig } from "../look/look.ts";
import { loadSceneAssets } from "../runtime/chapter-scene.ts";
import { buildFrame, createSceneFrame, defaultUi, SCENE_BUILDERS } from "../scene/build-frame.ts";
import { ENVIRONMENT } from "../scene/environment.ts";
import { shotPose } from "../scene/shots.ts";
import { fixtureRun, type LabScene } from "./fixtures.ts";
import type { ProbeApi } from "./probe.ts";

/** A chapter's scene at loop time `t` on its fixture run, as `/lab/scene/<slug>` draws it. */
export async function sceneFixture(slug: string, t: number): Promise<LabScene> {
  const def = CHAPTERS[slug as ChapterSlug];
  if (!def) throw new Error(`no written chapter "${slug}"`);
  const assets: SceneDesc["assets"] = {};
  await loadSceneAssets(def, assets);
  const frame = createSceneFrame({
    camera: shotPose(def.shot),
    scene: { revision: 0, parts: [], anchors: [], assets, environment: ENVIRONMENT.id },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  });
  const tl = evalTimeline(def.loop, t, createTimelineState(def.loop));
  const ui = defaultUi(def);
  buildFrame(def, tl, ui, fixtureRun(slug), frame);
  SCENE_BUILDERS[def.scene].tourPose?.(def, tl, ui, frame.input.camera);
  return { look: lookConfig(), input: frame.input };
}

const BLOCKS = 12;
const FRAMES_PER_BLOCK = 30;
const SETTLE_FRAMES = 8;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/** The features `/lab/perf` can toggle, and the debug settings for each state. */
export const TOGGLES = {
  bloom: (on: boolean): FrameInput["debug"] => ({ bloom: on }),
  text: (on: boolean): FrameInput["debug"] => ({ layers: on ? ~0 : ~Layer.text }),
};
export type Toggle = keyof typeof TOGGLES;

export async function measureToggle(
  canvas: HTMLCanvasElement,
  probe: ProbeApi,
  scene: Promise<LabScene>,
  toggle: Toggle,
) {
  const { look, input } = await scene;
  const renderer = await createRenderer(canvas, look, { timing: true });
  if ("unsupported" in renderer) throw new Error(renderer.unsupported);
  const frame: FrameInput = {
    ...input,
    timeSec: 0,
    viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
  };
  const samples: Record<"on" | "off", number[]> = { on: [], off: [] };
  for (let block = 0; block < BLOCKS; block++) {
    const on = block % 2 === 0;
    frame.debug = TOGGLES[toggle](on);
    for (let i = 0; i < FRAMES_PER_BLOCK; i++) {
      const { gpuMs } = renderer.frame(frame);
      if (i >= SETTLE_FRAMES && gpuMs !== null) samples[on ? "on" : "off"].push(gpuMs);
      await nextFrame();
    }
  }
  renderer.dispose();
  const on = median(samples.on);
  const off = median(samples.off);
  probe.results = {
    size: [canvas.width, canvas.height],
    toggle,
    medianMs: { on, off, delta: on - off },
    samples: { on: samples.on.length, off: samples.off.length },
  };
  if (!(samples.on.length && samples.off.length))
    probe.errors.push("no GPU timings were read back");
}
