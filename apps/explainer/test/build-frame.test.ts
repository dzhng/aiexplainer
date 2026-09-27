import { expect, test } from "bun:test";
import { countsModel, loadModel, nextWords } from "@repo/llm";
import { parseGlb, type SceneDesc } from "@repo/renderer";
import path from "node:path";
import { autocomplete } from "../src/chapters/data/autocomplete.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { buildFrame, createSceneFrame, type SceneUi } from "../src/scene/build-frame.ts";
import { computeRun } from "../src/runtime/scene-run.ts";

const publicDir = path.resolve(import.meta.dirname, "../public");
const board = parseGlb(
  await Bun.file(path.join(publicDir, "props/counter_board.glb")).arrayBuffer(),
);
const countsDir = path.join(publicDir, "models/counts");
const model = countsModel(
  await loadModel(
    await Bun.file(path.join(countsDir, "manifest.json")).json(),
    await Bun.file(path.join(countsDir, "weights.bin")).arrayBuffer(),
  ),
);
const session = { nextWords: async (word: string, k: number) => nextWords(model, word, k) };

function frameAt(t: number, ui: Partial<SceneUi> = {}, text: string | null = null) {
  const assets: SceneDesc["assets"] = { board };
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
  const tl = evalTimeline(autocomplete.loop, t, createTimelineState(autocomplete.loop));
  return { frame, tl, ui: { follow: null, slider: 5, view: "whole" as const, text, ...ui } };
}

const heights = (scene: SceneDesc) =>
  Array.from({ length: 10 }, (_, i) => scene.parts.find((p) => p.id === `bar.${i}`)!.transform[5]);

test("the scene is the board, ten bars and a card, in stable slots", async () => {
  const run = await computeRun(autocomplete, null, session, model.split);
  const { frame, tl, ui } = frameAt(5);
  const input = buildFrame(autocomplete, tl, ui, run, frame);
  expect(input.scene.parts.map((p) => [p.id, p.kind, p.slot])).toMatchSnapshot();
  expect(input.scene.anchors.map((a) => [a.id, a.part])).toEqual([
    ["board", "board"],
    ["bars", "bar.0"],
    ["rail", "card"],
  ]);
});

test("at full growth, bar heights are the real nextWords shares of the word on the rail", async () => {
  const run = (await computeRun(autocomplete, null, session, model.split))!;
  // t = 5: the first loop input is on the rail and its bars have fully risen.
  const { frame, tl, ui } = frameAt(5);
  expect(tl.channels.bars).toBe(1);
  const input = buildFrame(autocomplete, tl, ui, run, frame);
  const golden = nextWords(model, autocomplete.loop.inputs![0]!, 10);
  const h = heights(input.scene);
  // Heights are proportional to the shares; a share too small to see keeps a 4 mm sliver.
  for (let i = 1; i < 5; i++) {
    const want = (golden[i]!.p / golden[0]!.p) * h[0]!;
    expect(h[i]!).toBeCloseTo(Math.max(want, 0.004), 5);
  }
  // Bars past the slider are slivers; tags read word and share.
  for (let i = 5; i < 10; i++) expect(h[i]!).toBeLessThan(0.01);
  expect(frame.tags.text[0]).toBe(`${golden[0]!.word}\n${Math.round(golden[0]!.p * 100)}%`);
  expect(frame.tags.text[10]).toBe(autocomplete.loop.inputs![0]);
});

test("typed text shows its last word's bars at full height; an unseen word shows none", async () => {
  const typed = (await computeRun(autocomplete, "Once upon a", session, model.split))!;
  expect(typed.steps.map((s) => s.word)).toEqual(["a"]);
  // Loop time 0 has the bars down, but typed text ignores the loop's motion.
  const { frame, tl, ui } = frameAt(0, {}, "Once upon a");
  const h = heights(buildFrame(autocomplete, tl, ui, typed, frame).scene);
  const golden = nextWords(model, "a", 10);
  expect(h[1]! / h[0]!).toBeCloseTo(golden[1]!.p / golden[0]!.p, 5);

  const unseen = (await computeRun(autocomplete, "zzyzx", session, model.split))!;
  const blank = frameAt(0, {}, "zzyzx");
  const hb = heights(buildFrame(autocomplete, blank.tl, blank.ui, unseen, blank.frame).scene);
  expect(Math.max(...hb)).toBeLessThan(0.01);
  expect(blank.frame.tags.text.slice(0, 10).every((t) => t === "")).toBe(true);
});
