import { describe, expect, test } from "bun:test";
import { countsModel, nextWords } from "@repo/llm";
import { parseGlb, type SceneDesc } from "@repo/renderer";
import path from "node:path";
import { shippedContext } from "../scripts/shipped.ts";
import { autocomplete } from "../src/chapters/data/autocomplete.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { buildFrame, createSceneFrame, type SceneUi } from "../src/scene/build-frame.ts";
import { share } from "../src/chapters/format.ts";
import { computeRun as runFor } from "../src/runtime/scene-run.ts";
import type { CountsRun } from "../src/scene/builders/autocomplete.ts";
import { textOf, texts } from "./scene-harness.ts";

const publicDir = path.resolve(import.meta.dirname, "../public");
const board = parseGlb(
  await Bun.file(path.join(publicDir, "props/counter_board.glb")).arrayBuffer(),
);
const ctx = await shippedContext("counts");
const model = countsModel(ctx.model as Parameters<typeof countsModel>[0]);
const computeRun = async (def: typeof autocomplete, text: string | null) =>
  (await runFor(def, text, ctx)) as CountsRun;

function frameAt(t: number, ui: Partial<SceneUi> = {}, text: string | null = null) {
  const assets: SceneDesc["assets"] = { board };
  const frame = createSceneFrame({
    camera: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5, fovY: 0.7 },
    scene: { revision: 0, parts: [], anchors: [], assets },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  });
  const tl = evalTimeline(autocomplete.loop, t, createTimelineState(autocomplete.loop));
  return {
    frame,
    tl,
    ui: { slider: 5, sliderSet: false, text, ...ui },
  };
}

const heights = (scene: SceneDesc) =>
  Array.from({ length: 10 }, (_, i) => scene.parts.find((p) => p.id === `bar.${i}`)!.transform[5]);

test("the scene is the board, ten bars and the text's cards, in stable slots", async () => {
  const run = await computeRun(autocomplete, null);
  const { frame, tl, ui } = frameAt(5);
  const input = buildFrame(autocomplete, tl, ui, run, frame);
  expect(input.scene.parts.map((p) => [p.id, p.kind, p.slot])).toMatchSnapshot();
  expect(input.scene.anchors.map((a) => [a.id, a.part])).toEqual([
    ["board", "board.housing"],
    ["bars", "bar.0"],
    ["rail", "card"],
  ]);
});

test("at full growth, bar heights are the real nextWords shares of the word on the rail", async () => {
  const run = (await computeRun(autocomplete, null))!;
  // t = 4: the first loop input is on the rail and its bars have fully risen.
  const { frame, tl, ui } = frameAt(4);
  expect(tl.channels.bars).toBe(1);
  const input = buildFrame(autocomplete, tl, ui, run, frame);
  const golden = nextWords(model, autocomplete.loop.inputs![0]!, 10);
  const h = heights(input.scene);
  // Heights are proportional to the shares; a share too small to see keeps a 4 mm sliver.
  for (let i = 1; i < 5; i++) {
    const want = (golden[i]!.p / golden[0]!.p) * h[0]!;
    expect(h[i]!).toBeCloseTo(Math.max(want, 0.004), 5);
  }
  // Bars past the slider are slivers; each slot names its word and its share.
  for (let i = 5; i < 10; i++) expect(h[i]!).toBeLessThan(0.01);
  expect(textOf(input.scene, "word.0").text).toBe(golden[0]!.word);
  expect(textOf(input.scene, "share.0").text).toBe(`${Math.round(golden[0]!.p * 100)}%`);
  expect(textOf(input.scene, "card").text).toBe(autocomplete.loop.inputs![0]!);
});

test("typed text shows its last word's bars at full height; an unseen word shows none", async () => {
  const typed = (await computeRun(autocomplete, "Once upon a"))!;
  expect(typed.steps.map((s) => s.word)).toEqual(["a"]);
  // Loop time 0 has the bars down, but typed text ignores the loop's motion.
  const { frame, tl, ui } = frameAt(0, {}, "Once upon a");
  const h = heights(buildFrame(autocomplete, tl, ui, typed, frame).scene);
  const golden = nextWords(model, "a", 10);
  expect(h[1]! / h[0]!).toBeCloseTo(golden[1]!.p / golden[0]!.p, 5);

  const unseen = (await computeRun(autocomplete, "zzyzx"))!;
  const blank = frameAt(0, {}, "zzyzx");
  const blankScene = buildFrame(autocomplete, blank.tl, blank.ui, unseen, blank.frame).scene;
  expect(Math.max(...heights(blankScene))).toBeLessThan(0.01);
  const slotText = blankScene.text!.filter((t) => /^(word|share)\./.test(t.id));
  expect(slotText.every((t) => t.text === "")).toBe(true);
});

describe("chapter 0's loop", () => {
  const inputs = autocomplete.loop.inputs!;
  const unseen = inputs.at(-1)!;
  const last = (text: string) => text.split(" ").at(-1)!;

  test("its texts grow by the model's own picks (O2): each adds the last word's top pick", () => {
    for (let i = 1; i < inputs.length - 1; i++) {
      const pick = nextWords(model, last(inputs[i - 1]!), 1)[0]!.word;
      expect(inputs[i]).toBe(`${inputs[i - 1]} ${pick}`);
    }
    expect(inputs.slice(0, 3)).toEqual(["once", "once upon", "once upon a"]);
    expect(model.index.has(unseen)).toBe(false);
  });

  test("the rail holds the whole text as cards, the header names the lookup", async () => {
    const run = (await computeRun(autocomplete, null))!;
    const { frame, tl, ui } = frameAt(12.5);
    const { scene } = buildFrame(autocomplete, tl, ui, run, frame);
    // "a" on the lit card, "once" and "upon" on dim cards left of it, bars for "a".
    expect(textOf(scene, "card")).toMatchObject({ text: "a", part: "card", style: "ink" });
    expect(textOf(scene, "header")).toMatchObject({
      text: "After “a”…",
      part: "board.housing",
      style: "sign",
    });
    const dim = scene.text!.filter((t) => t.id.startsWith("earlier.") && t.text);
    expect(dim.map((t) => t.text)).toEqual(["once", "upon"]);
    expect(dim.map((t) => [t.part, t.style])).toEqual([
      ["earlier.0", "muted"],
      ["earlier.1", "muted"],
    ]);
  });

  test("a long text keeps its end on the rail, and its first card says it goes on", async () => {
    const words =
      "once upon a time there was a little girl named lily who loved to play in the big green park with her dog and her friend tom every sunny day".split(
        " ",
      );
    const run = (await computeRun(autocomplete, words.join(" ")))!;
    const { frame, tl, ui } = frameAt(0, {}, words.join(" "));
    const input = buildFrame(autocomplete, tl, ui, run, frame);
    const shown = texts(input.scene).filter(
      (t, i) => input.scene.text![i]!.id.startsWith("earlier.") && t,
    );
    expect(shown[0]).toBe("…");
    expect(shown.slice(1)).toEqual(words.slice(-shown.length, -1));
    // Every dim card shown sits on the rail, left of the lit card and clear of each other.
    const cards = input.scene.parts
      .filter((p) => p.id.startsWith("earlier.") && p.transform[0]! > 1e-3)
      .map((p) => ({
        l: p.transform[12]! - p.transform[0]! / 2,
        r: p.transform[12]! + p.transform[0]! / 2,
      }));
    const lit = input.scene.parts.find((p) => p.id === "card")!.transform;
    expect(cards).toHaveLength(shown.length);
    for (let i = 1; i < cards.length; i++) expect(cards[i]!.l).toBeGreaterThan(cards[i - 1]!.r);
    expect(cards.at(-1)!.r).toBeLessThan(lit[12]! - lit[0]! / 2);
  });

  test("the point lands by 10 s: two picks light up before then", () => {
    const lit = autocomplete.loop.channels.topFlash!.filter((k) => k.v === 1).map((k) => k.t);
    expect(lit.filter((t) => t <= 10).length).toBeGreaterThanOrEqual(2);
    const beat = (id: string) => autocomplete.loop.beats.find((b) => b.id === id)!.t;
    expect(beat("top-flash")).toBeLessThan(10);
    expect(beat("next-word")).toBeLessThan(10);
  });

  test("the failure beat shows the unseen word and no bars; the seam matches", async () => {
    const run = (await computeRun(autocomplete, null))!;
    const at = (t: number) => {
      const { frame, tl, ui } = frameAt(t);
      const input = buildFrame(autocomplete, tl, ui, run, frame);
      const card = input.scene.parts.find((p) => p.id === "card")!;
      const text = (id: string) => textOf(input.scene, id).text;
      return { h: heights(input.scene), text, card };
    };
    const failure = at(17);
    expect(failure.text("card")).toBe(unseen);
    expect(Math.max(...failure.h)).toBeLessThan(0.01);
    expect(failure.text("no-counts")).toContain(unseen);
    // While "upon" rides onto the card, the bars still show (and light) "once"'s counts.
    const handoff = at(6);
    expect(handoff.text("card")).toBe("upon");
    expect(handoff.text("word.0")).toBe("upon");
    // The loop's last instant and its first draw the same frame (card off the rail, bars flat).
    const end = at(autocomplete.loop.durationSec - 1e-6);
    const start = at(0);
    expect(end.card.transform[12]).toBeCloseTo(start.card.transform[12]!, 3);
    expect(Math.max(...end.h, ...start.h)).toBeLessThan(0.01);
  });
});

test("shares never round to a false 0% or 100%", () => {
  expect([share(0.004), share(0.049), share(0.94), share(0.999), share(1)]).toEqual([
    "<1%",
    "5%",
    "94%",
    ">99%",
    "100%",
  ]);
});

test("the scene builds only from the primitives its scene declares", async () => {
  const run = await computeRun(autocomplete, null);
  const { frame, tl, ui } = frameAt(5);
  const input = buildFrame(autocomplete, tl, ui, run, frame);
  const declared = SCENE_KIT[autocomplete.scene];
  for (const part of input.scene.parts) expect(declared).toContain(part.primitive!);
});
