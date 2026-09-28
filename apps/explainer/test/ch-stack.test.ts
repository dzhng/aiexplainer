import { expect, test } from "bun:test";
import {
  generate,
  probeResult,
  promptTokens,
  seededRng,
  transformerModel,
  forward,
} from "@repo/llm";
import { stack as def } from "../src/chapters/data/stack.ts";
import type { TubePart } from "@repo/renderer";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { validateChapter } from "../src/chapters/validate.ts";
import { CONTINUATION } from "../src/runtime/runs/stack.ts";
import { pipeRadius, type StackRun } from "../src/scene/builders/stack.ts";
import { chapterRun, fixtureRun, frameAt, shippedModel } from "./scene-harness.ts";

const loaded = await shippedModel("full");
const model = transformerModel(loaded);
const run = (await chapterRun(def)) as StackRun;
const tokens = promptTokens(model.tokenizer, run.prompt);
/** The hero time: every head's pipes grown, the camera on block 1. */
const HERO = 5.5;

test("the committed fixture is the app's run on the loop's prompt", async () => {
  expect(await fixtureRun(def)).toEqual(JSON.parse(JSON.stringify(run)));
});

test("every pipe in every block is that layer's head's real attention weight from the last word", () => {
  const trace = forward(model, tokens, { trace: { tokens: [tokens.length - 1] } }).trace!;
  const { scene, frame } = frameAt(def, run, HERO);
  const widthScale = frame.input.dynamics.widthScale;
  const n = tokens.length;
  trace.layers.forEach((layer, l) => {
    const w = layer!.attn!.weights.data;
    for (let h = 0; h < model.arch.nHeads; h++)
      for (let i = 0; i < n; i++) {
        expect(run.weights[l]![h]![i]).toBe(w[h * n + i]!);
        const pipe = scene.parts.find((p) => p.id === `block.${l}.pipe.${h}.${i}`) as TubePart;
        // The pipe's drawn radius: the kit pipe's radius, scaled by its slot's widthScale.
        expect(pipe.radius * widthScale[pipe.slot]!).toBeCloseTo(pipeRadius(w[h * n + i]!), 6);
      }
  });
});

test("heads that share notes share a colour: GQA's key/value groups", () => {
  const arch = model.arch;
  expect(arch.nKvHeads).toBeLessThan(arch.nHeads);
  expect(run.kvGroup).toEqual([0, 0, 1, 1]);
  const { scene } = frameAt(def, run, HERO);
  const material = (h: number) =>
    (scene.parts.find((p) => p.id === `block.0.pipe.${h}.0`) as { material: string }).material;
  expect(material(0)).toBe(material(1));
  expect(material(2)).toBe(material(3));
  expect(material(0)).not.toBe(material(2));
});

test("the page is the worker's own seeded continuation", () => {
  const steps = [
    ...generate(model, tokens, {
      maxNewTokens: CONTINUATION.maxNewTokens,
      temperature: CONTINUATION.temperature,
      rng: seededRng(CONTINUATION.seed),
    }),
  ];
  expect(run.continuation).toBe(model.tokenizer.decode(steps.map((s) => s.token)));
  expect(run.next).toBe(model.tokenizer.decode([steps[0]!.token]));
});

test("chips: heads from the model, the heads-differ probe, Llama-3-8B's 32 layers", () => {
  const [readers, differ, llama] = def.stats;
  expect(resolveStat(readers, loaded)).toBe(model.arch.nHeads);
  expect(resolveStat(differ, loaded)).toBe(probeResult(loaded.manifest, "heads-differ").value);
  expect(resolveStat(llama, loaded)).toBe(32);
  for (const s of def.scenarios) expect(probeResult(loaded.manifest, s.probe).pass).toBe(true);
});

test("the one zoom-out: a pull-back channel that rises and returns within the loop", () => {
  expect(validateChapter(def)).toEqual([]);
  const zoom = def.loop.channels[def.pullBack!.channel]!;
  expect(Math.max(...zoom.map((k) => k.v))).toBe(1);
  expect(zoom.at(-1)!.v).toBe(0);
  const broken = { ...def, pullBack: { shot: def.pullBack!.shot, channel: "nope" } };
  expect(validateChapter(broken)).toContain("pullBack: no loop channel nope");
});

test("the point lands by 10 s, and the loop's seam draws the same frame", () => {
  expect(def.loop.beats.find((b) => b.id === "readers")!.t).toBeLessThan(10);
  const start = frameAt(def, run, 0);
  const end = frameAt(def, run, def.loop.durationSec - 1e-6);
  start.scene.parts.forEach((part, i) => {
    const other = end.scene.parts[i]!.transform;
    part.transform.forEach((v, j) => expect(other[j]!).toBeCloseTo(v, 2));
  });
});

test("the scene is built from its declared primitives, in stable slots", () => {
  const { scene } = frameAt(def, run, HERO);
  for (const part of scene.parts) expect(SCENE_KIT.stack).toContain(part.primitive!);
  expect(scene.parts.length).toMatchSnapshot();
});
