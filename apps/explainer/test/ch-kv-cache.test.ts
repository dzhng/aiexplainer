import { expect, test } from "bun:test";
import {
  cacheBytesPerToken,
  evalArith,
  generate,
  promptTokens,
  seededRng,
  transformerModel,
} from "@repo/llm";
import { kvCache as def } from "../src/chapters/data/kv-cache.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { CONTINUATION } from "../src/chapters/data/stack.ts";
import { KV_STEPS, KV_WINDOW, notesWritten, type KvRun } from "../src/scene/builders/kv-cache.ts";
import { chapterRun, fixtureRun, frameAt, shippedModel } from "./scene-harness.ts";

const loaded = await shippedModel("full");
const model = transformerModel(loaded);
const run = (await chapterRun(def)) as KvRun;
const tokens = promptTokens(model.tokenizer, run.prompt);
const draw = (window?: number, cache?: boolean) => [
  ...generate(model, tokens, {
    maxNewTokens: KV_STEPS,
    temperature: CONTINUATION.temperature,
    rng: seededRng(CONTINUATION.seed),
    window,
    cache,
  }),
];

test("the committed fixture is the app's run on the loop's prompt", async () => {
  expect(await fixtureRun(def)).toEqual(JSON.parse(JSON.stringify(run)));
});

test("with notes kept, the words match rereading everything, and each later step feeds one token", () => {
  const cached = draw();
  const reread = draw(undefined, false);
  const words = (steps: typeof cached) => steps.map((s) => model.tokenizer.decode([s.token]));
  expect(run.steps.map((s) => s.word)).toEqual(words(cached));
  expect(words(cached)).toEqual(words(reread));
  expect(run.steps.map((s) => s.fed)).toEqual([tokens.length, 1, 1, 1]);
});

test("the window's words are a windowed reference's, and differ from the full context's", () => {
  const ring = draw(KV_WINDOW);
  const windowedReread = draw(KV_WINDOW, false);
  const words = (steps: typeof ring) => steps.map((s) => model.tokenizer.decode([s.token]));
  expect(run.windowed).toEqual(words(ring));
  expect(words(ring)).toEqual(words(windowedReread));
  expect(run.windowed).not.toEqual(run.steps.map((s) => s.word));
  expect(def.loop.beats.find((b) => b.id === "window")!.note).toContain(`last ${KV_WINDOW}`);
});

test("the byte chips are kvBytesPerToken: this tiny model's, and Llama-3-8B's by arithmetic", () => {
  const [tiny, llama, weights] = def.stats;
  expect(resolveStat(tiny, loaded)).toBe(cacheBytesPerToken(model));
  expect(run.bytesPerToken).toBe(cacheBytesPerToken(model));
  expect(resolveStat(llama, loaded)).toBe(2 * 32 * 8 * 128 * 2);
  expect(resolveStat(weights, loaded)).toBe(evalArith("weightBytes", { weightBytes: 2 }));
});

test("the rack's memory note counts the notes written: each word's once", () => {
  expect(notesWritten(tokens.length, 0)).toBe(0);
  expect(notesWritten(tokens.length, 4)).toBe(tokens.length + 3);
  const done = frameAt(def, run, 12.8);
  const note = done.frame.tags.text.find((t) => t.startsWith("notes:"))!;
  expect(note).toContain(`${tokens.length + KV_STEPS - 1} words`);
});

test("the copy says the window changes outputs and is not how Llama-3-8B runs", () => {
  const text = JSON.stringify(def.caption);
  expect(text).toContain("changes outputs");
  expect(text).toContain("not how Llama-3-8B runs");
});

test("the point lands by 10 s, and the loop's seam draws the same frame", () => {
  expect(def.loop.beats.find((b) => b.id === "read-notes")!.t).toBeLessThan(10);
  const start = frameAt(def, run, 0);
  const end = frameAt(def, run, def.loop.durationSec - 1e-6);
  start.scene.parts.forEach((part, i) => {
    const other = end.scene.parts[i]!.transform;
    part.transform.forEach((v, j) => expect(other[j]!).toBeCloseTo(v, 2));
  });
});

test("the scene is built from its declared primitives", () => {
  const { scene } = frameAt(def, run, 11.5);
  for (const part of scene.parts) expect(SCENE_KIT["kv-cache"]).toContain(part.primitive!);
  expect(scene.parts.length).toMatchSnapshot();
});
