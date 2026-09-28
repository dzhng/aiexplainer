import { expect, test } from "bun:test";
import { forward, probeResult, promptTokens, transformerModel } from "@repo/llm";
import { residual as def } from "../src/chapters/data/residual.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { knobAngle, riverHeight, type ResidualRun } from "../src/scene/builders/residual.ts";
import { chapterRun, fixtureRun, frameAt, shippedModel } from "./scene-harness.ts";

const withModel = await shippedModel("residual");
const withoutModel = await shippedModel("noresidual");
const run = (await chapterRun(def)) as ResidualRun;
/** The hero time: the river full, every station poured in, every knob turned. */
const HERO = 11;

const rms = (values: ArrayLike<number>) =>
  Math.sqrt(Array.from(values).reduce((s, v) => s + v * v, 0) / values.length);

test("the committed fixture is the app's run on the loop's prompt", async () => {
  expect(await fixtureRun(def)).toEqual(JSON.parse(JSON.stringify(run)));
});

test("stream sizes are each model's traced residual norms at the last token", () => {
  for (const [pass, loaded] of [
    [run.with, withModel],
    [run.without, withoutModel],
  ] as const) {
    const model = transformerModel(loaded);
    const tokens = promptTokens(model.tokenizer, run.prompt);
    const trace = forward(model, tokens, { trace: { tokens: [tokens.length - 1] } }).trace!;
    trace.layers.forEach((layer, l) => {
      expect(pass.stream[l]).toBe(layer!.attn!.residual.rms.data[0]!);
    });
    expect(pass.stream.at(-1)).toBeCloseTo(rms(trace.layers.at(-1)!.mlpResidual!.sum.data), 6);
  }
  // Without the river the signal dies; with it, it grows.
  expect(run.without.stream.at(-1)! / run.without.stream[0]!).toBeLessThan(1e-3);
  expect(run.with.stream.at(-1)! / run.with.stream[0]!).toBeGreaterThan(1);
});

test("river heights and knob angles are the traced sizes, through their stated scales", () => {
  const { scene } = frameAt(def, run, HERO);
  const embed = run.with.stream[0]!;
  run.with.stream.forEach((size, i) => {
    const stretch = scene.parts.find((p) => p.id === `river.stretch.${i}`)!;
    expect(stretch.transform[5]).toBeCloseTo(riverHeight(size / embed), 6);
  });
  // The knob turns further down at every station, as the river it reads grows.
  const angles = run.with.stream.slice(0, 4).map((size) => knobAngle(size / embed));
  for (let k = 1; k < angles.length; k++) expect(angles[k]!).toBeLessThan(angles[k - 1]!);
});

test("the loss chips are the two models' measured validation losses", () => {
  const [without, withRiver, signal] = def.stats;
  expect(resolveStat(without, withModel)).toBe(withoutModel.manifest.training!.valLoss!);
  expect(resolveStat(withRiver, withModel)).toBe(withModel.manifest.training!.valLoss!);
  expect(resolveStat(signal, withModel)).toBe(
    probeResult(withModel.manifest, "signal-preserved-residual").value,
  );
  for (const scenario of def.scenarios)
    expect(probeResult(withModel.manifest, scenario.probe).pass).toBe(true);
});

test("without the river the readout says every word is equally likely; with it, a real guess", () => {
  expect(run.without.p * run.without.vocab).toBeLessThan(1.5);
  expect(run.with.p * run.with.vocab).toBeGreaterThan(100);
  const noRiver = frameAt(def, run, 3.5);
  expect(noRiver.frame.tags.text[1]).toContain("1 in 4,096 each");
  const hero = frameAt(def, run, HERO);
  expect(hero.frame.tags.text[1]).toContain(run.with.answer.trim());
});

test("the point lands by 10 s, and the loop's seam draws the same frame", () => {
  const beat = (id: string) => def.loop.beats.find((b) => b.id === id)!.t;
  expect(beat("pour")).toBeLessThan(10);
  const start = frameAt(def, run, 0);
  const end = frameAt(def, run, def.loop.durationSec - 1e-6);
  start.scene.parts.forEach((part, i) => {
    const other = end.scene.parts[i]!.transform;
    part.transform.forEach((v, j) => expect(other[j]!).toBeCloseTo(v, 2));
  });
});

test("the scene is built from its declared primitives, in stable slots", () => {
  const { scene } = frameAt(def, run, HERO);
  for (const part of scene.parts) expect(SCENE_KIT.residual).toContain(part.primitive!);
  expect(scene.parts.map((p) => [p.id, p.kind, p.slot])).toMatchSnapshot();
});
