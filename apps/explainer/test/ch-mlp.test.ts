import { expect, test } from "bun:test";
import { forward, probeResult, promptTokens, transformerModel } from "@repo/llm";
import { mlp as def } from "../src/chapters/data/mlp.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { MLP_OFF } from "../src/runtime/runs/mlp.ts";
import { MLP_LAMPS, type MlpRun } from "../src/scene/builders/mlp.ts";
import { chapterRun, fixtureRun, frameAt, shippedModel } from "./scene-harness.ts";

const loaded = await shippedModel("mlp");
const model = transformerModel(loaded);
const run = (await chapterRun(def)) as MlpRun;
const prompt = def.loop.inputs![0]!;
const tokens = promptTokens(model.tokenizer, prompt);
const last = tokens.length - 1;
const trace = forward(model, tokens, { trace: { tokens: [last] } }).trace!;
const act = trace.layers[0]!.mlp!.act.data;
/** The hero time: every lamp lit, every push landed, the with-all bar up. */
const HERO = 8.8;

test("the committed fixture is the app's run on the loop's prompt", async () => {
  expect(await fixtureRun(def)).toEqual(JSON.parse(JSON.stringify(run)));
});

test("the lamps are the most active neurons, with the trace's own activations", () => {
  const byActivity = Array.from(act.keys()).sort((a, b) => Math.abs(act[b]!) - Math.abs(act[a]!));
  expect(run.lamps.map((l) => l.neuron).sort((a, b) => a - b)).toEqual(
    byActivity.slice(0, MLP_LAMPS).sort((a, b) => a - b),
  );
  for (const lamp of run.lamps) {
    expect(lamp.act).toBe(act[lamp.neuron]!);
    expect(lamp.rank).toBe(byActivity.indexOf(lamp.neuron));
  }
});

test("lamp brightness follows |activation|: a more active neuron's lamp never glows less", () => {
  const { intensity } = frameAt(def, run, HERO);
  const lamps = run.lamps.map((lamp, i) => ({ act: Math.abs(lamp.act), glow: intensity[1 + i]! }));
  lamps.sort((a, b) => b.act - a.act);
  for (let i = 1; i < lamps.length; i++)
    expect(lamps[i]!.glow).toBeLessThanOrEqual(lamps[i - 1]!.glow);
  expect(lamps[0]!.glow).toBeGreaterThan(lamps.at(-1)!.glow);
});

test("each push is that neuron's exact share of the answer's score: act × (unembed · w2 column)", () => {
  const { dModel: d } = model.arch;
  const hidden = act.length;
  const w2 = model.layers[0]!.mlp!.w2;
  const answer = model.tokenizer.encode(run.answer)[0]!;
  for (const lamp of run.lamps) {
    let dot = 0;
    for (let i = 0; i < d; i++)
      dot += w2[i * hidden + lamp.neuron]! * model.lmHead[answer * d + i]!;
    expect(lamp.push).toBeCloseTo(lamp.act * dot, 3);
  }
});

test("the shown ablation reproduces the probe's own example and chip", () => {
  const example = loaded.manifest.evidence.find((e) => e.probe === "mlp-neurons" && e.prompt)!;
  expect(example.prompt).toStartWith(prompt);
  expect(`${prompt} …${run.answer}`).toBe(example.prompt);
  expect(run.offCount).toBe(MLP_OFF);
  expect(1 - run.pOff / run.p).toBeCloseTo(example.value, 3);
  expect(example.metric).toContain(`${run.p.toFixed(3)} → ${run.pOff.toFixed(3)}`);
  const [questions, topOff, llama] = def.stats;
  expect(resolveStat(topOff, loaded)).toBe(probeResult(loaded.manifest, "mlp-neurons").value);
  expect(resolveStat(questions, loaded)).toBe(act.length);
  expect(resolveStat(llama, loaded)).toBe(14_336);
});

test("every scenario cites a passing probe, and its prompt runs", async () => {
  for (const scenario of def.scenarios) {
    expect(probeResult(loaded.manifest, scenario.probe).pass).toBe(true);
    const typed = (await chapterRun(def, scenario.prompt)) as MlpRun;
    expect(typed.prompt).toBe(scenario.prompt);
    expect(typed.p).toBeGreaterThan(typed.pOff);
  }
});

test("the failure teaser is the noresidual model's stream: it is gone after the first station", async () => {
  const noresidual = await shippedModel("noresidual");
  expect(probeResult(noresidual.manifest, "signal-preserved-noresidual").value).toBe(0);
  expect(run.fade[0]).toBe(1);
  const layers = noresidual.manifest.kind === "transformer" ? noresidual.manifest.arch.nLayers : 0;
  // Entering each layer, then leaving the last.
  expect(run.fade).toHaveLength(layers + 1);
  expect(Math.max(...run.fade.slice(1))).toBeLessThan(1e-3);
});

test("the point lands by 10 s, and the loop's seam draws the same frame", () => {
  const beat = (id: string) => def.loop.beats.find((b) => b.id === id)!.t;
  expect(beat("lamps")).toBeLessThan(10);
  expect(beat("pushes")).toBeLessThan(10);
  const start = frameAt(def, run, 0);
  const end = frameAt(def, run, def.loop.durationSec - 1e-6);
  const place = (s: typeof start) => s.scene.parts.map((p) => Array.from(p.transform));
  const a = place(start);
  const b = place(end);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < 16; j++) expect(b[i]![j]!).toBeCloseTo(a[i]![j]!, 2);
});

test("the scene is built from its declared primitives, in stable slots", () => {
  const { scene } = frameAt(def, run, HERO);
  for (const part of scene.parts) expect(SCENE_KIT.mlp).toContain(part.primitive!);
  expect(scene.parts.map((p) => [p.id, p.kind, p.slot])).toMatchSnapshot();
});
