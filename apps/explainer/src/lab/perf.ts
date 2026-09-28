/**
 * `/lab/perf?fixture=board-room`, or `/lab/perf?scene=<slug>&t=<loop time>` for a chapter's
 * scene on its fixture run (the camera at its shot, or its tour's pose): whole-frame GPU time with bloom on vs off, interleaved in
 * short alternating blocks on one renderer so machine load hits both equally. Readback
 * lags a few frames, so each block's first frames are dropped. Results go to
 * `probe.results`; the budget check is the harness's job (it prints them).
 */
import { createRenderer, type FrameInput, type SceneDesc } from "@repo/renderer";
import { CHAPTERS } from "../chapters/index.ts";
import type { ChapterSlug } from "../chapters/ladder.ts";
import { createTimelineState, evalTimeline } from "../chapters/timeline.ts";
import { lookConfig } from "../look/look.ts";
import { loadSceneAssets } from "../runtime/chapter-scene.ts";
import {
  buildFrame,
  createSceneFrame,
  SCENE_BUILDERS,
  type SceneRun,
  type SceneUi,
} from "../scene/build-frame.ts";
import { ENVIRONMENT } from "../scene/environment.ts";
import { shotPose } from "../scene/shots.ts";
import type { LabScene } from "./fixtures.ts";
import type { ProbeApi } from "./probe.ts";

const runs = import.meta.glob<SceneRun>("./fixtures/runs/*.json", {
  eager: true,
  import: "default",
});

/** A chapter's scene at loop time `t` on its fixture run, as `/lab/scene/<slug>` draws it. */
export async function sceneFixture(slug: string, t: number): Promise<LabScene> {
  const def = CHAPTERS[slug as ChapterSlug];
  if (!def) throw new Error(`no written chapter "${slug}"`);
  const assets: SceneDesc["assets"] = {};
  await loadSceneAssets(def, assets);
  const frame = createSceneFrame({
    camera: shotPose(def.shot),
    view: { mode: def.views[0] ?? "whole", t: 0 },
    scene: { revision: 0, parts: [], anchors: [], assets, environment: ENVIRONMENT.id },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  });
  const tl = evalTimeline(def.loop, t, createTimelineState(def.loop));
  const ui: SceneUi = {
    follow: null,
    slider: def.slider.initial,
    sliderSet: false,
    view: def.views[0] ?? "whole",
    text: null,
  };
  const run = runs[`./fixtures/runs/${slug}.json`] ?? null;
  buildFrame(def, tl, ui, run, frame);
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

export async function measureBloom(
  canvas: HTMLCanvasElement,
  probe: ProbeApi,
  scene: Promise<LabScene>,
) {
  const { look, input } = await scene;
  const renderer = await createRenderer(canvas, look, { timing: true });
  if ("unsupported" in renderer) throw new Error(renderer.unsupported);
  const frame: FrameInput = {
    ...input,
    timeSec: 0,
    viewport: { width: canvas.clientWidth, height: canvas.clientHeight, dpr: devicePixelRatio },
    debug: { bloom: true },
  };
  const samples: Record<"on" | "off", number[]> = { on: [], off: [] };
  for (let block = 0; block < BLOCKS; block++) {
    const bloom = block % 2 === 0;
    frame.debug = { bloom };
    for (let i = 0; i < FRAMES_PER_BLOCK; i++) {
      const { gpuMs } = renderer.frame(frame);
      if (i >= SETTLE_FRAMES && gpuMs !== null) samples[bloom ? "on" : "off"].push(gpuMs);
      await nextFrame();
    }
  }
  renderer.dispose();
  const on = median(samples.on);
  const off = median(samples.off);
  probe.results = {
    size: [canvas.width, canvas.height],
    medianMs: { bloomOn: on, bloomOff: off, delta: on - off },
    samples: { on: samples.on.length, off: samples.off.length },
  };
  if (!(samples.on.length && samples.off.length))
    probe.errors.push("no GPU timings were read back");
}
