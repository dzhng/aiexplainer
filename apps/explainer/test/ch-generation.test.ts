import { expect, test } from "bun:test";
import { generate, promptTokens, seededRng, transformerModel } from "@repo/llm";
import { generation as def } from "../src/chapters/data/generation.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { CONTINUATION } from "../src/chapters/data/stack.ts";
import {
  GENERATION_STEPS,
  workSoFar,
  type GenerationRun,
} from "../src/scene/builders/generation.ts";
import { chapterRun, fixtureRun, frameAt, shippedModel } from "./scene-harness.ts";

const loaded = await shippedModel("full");
const model = transformerModel(loaded);
const run = (await chapterRun(def)) as GenerationRun;
const tokens = promptTokens(model.tokenizer, run.prompt);

test("the committed fixture is the app's run on the loop's prompt", async () => {
  expect(await fixtureRun(def)).toEqual(JSON.parse(JSON.stringify(run)));
});

test("the words are the worker's seeded generation, and the same seed writes them again", async () => {
  const steps = [
    ...generate(model, tokens, {
      maxNewTokens: GENERATION_STEPS,
      temperature: CONTINUATION.temperature,
      rng: seededRng(CONTINUATION.seed),
      cache: false,
    }),
  ];
  expect(run.steps.map((s) => s.word)).toEqual(steps.map((s) => model.tokenizer.decode([s.token])));
  expect(((await chapterRun(def)) as GenerationRun).steps).toEqual(run.steps);
});

test("the work counter is the sum of the prefix lengths each step reread", () => {
  expect(run.steps.map((s) => s.fed)).toEqual(run.steps.map((_, i) => tokens.length + i));
  const total = run.steps.reduce((sum, s) => sum + s.fed, 0);
  expect(workSoFar(run.steps, GENERATION_STEPS)).toBe(total);
  // After the loop has written every word, the counter's tag says exactly that sum.
  const done = frameAt(def, run, 19.2);
  expect(done.frame.tags.text.find((t) => t.startsWith("tokens read"))).toBe(
    `tokens read: ${total}`,
  );
  // Each step costs one more token than the last: the counter's growth is quadratic.
  const gaps = run.steps.slice(1).map((s, i) => s.fed - run.steps[i]!.fed);
  expect(gaps.every((g) => g === 1)).toBe(true);
});

test("chips: the context from the model, Llama-3-8B's from its config, the rereading sum", () => {
  const [context, reread, llama] = def.stats;
  expect(resolveStat(context, loaded)).toBe(model.arch.ctx);
  expect(resolveStat(reread, loaded)).toBe((256 * 257) / 2);
  expect(resolveStat(llama, loaded)).toBe(8192);
});

test("the point lands by 10 s, and the loop's seam draws the same frame", () => {
  expect(def.loop.beats.find((b) => b.id === "again")!.t).toBeLessThan(10);
  const start = frameAt(def, run, 0);
  const end = frameAt(def, run, def.loop.durationSec - 1e-6);
  start.scene.parts.forEach((part, i) => {
    const other = end.scene.parts[i]!.transform;
    part.transform.forEach((v, j) => expect(other[j]!).toBeCloseTo(v, 2));
  });
});

test("the scene is built from its declared primitives", () => {
  const { scene } = frameAt(def, run, 10);
  for (const part of scene.parts) expect(SCENE_KIT.generation).toContain(part.primitive!);
});
