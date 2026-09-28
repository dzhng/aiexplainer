import { describe, expect, test } from "bun:test";
import {
  evalArith,
  generate,
  probeResult,
  promptTokens,
  seededRng,
  transformerModel,
  weightSlice,
  type LoadedModel,
} from "@repo/llm";
import type { BlockPart, SceneDesc } from "@repo/renderer";
import { shippedContext, shippedModel } from "../scripts/shipped.ts";
import { CONTINUE_WORDS, STRIP, quantization } from "../src/chapters/data/quantization.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { validateChapter } from "../src/chapters/validate.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import {
  buildFrame,
  createSceneFrame,
  type QuantizationRun,
  type SceneUi,
} from "../src/scene/build-frame.ts";
import { lensIndex } from "../src/scene/builders/quantization.ts";

const full = await shippedModel("full");
const q8 = await shippedModel("full-q8");
const run = (await computeRun(
  quantization,
  null,
  await shippedContext("full-q8"),
)) as QuantizationRun;

function frameAt(t: number, ui: Partial<SceneUi> = {}, r: QuantizationRun = run) {
  const frame = createSceneFrame({
    camera: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5, fovY: 0.7 },
    view: { mode: "whole", t: 0 },
    scene: { revision: 0, parts: [], anchors: [], assets: {} },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  });
  const tl = evalTimeline(quantization.loop, t, createTimelineState(quantization.loop));
  const full: SceneUi = {
    follow: null,
    slider: quantization.slider.initial,
    sliderSet: false,
    view: "whole",
    text: null,
    ...ui,
  };
  const input = buildFrame(quantization, tl, full, r, frame);
  return { input, tags: frame.tags.text };
}

const part = (scene: SceneDesc, id: string) => scene.parts.find((p) => p.id === id) as BlockPart;
const probe = (m: LoadedModel, id: string) => probeResult(m.manifest, id).value;

describe("chapter 12's numbers equal their sources", () => {
  test("the strip is the real tensor slice and its dequantized 8-bit copy", () => {
    const f16 = weightSlice(full, STRIP.tensor, STRIP.start, STRIP.count);
    const int8 = weightSlice(q8, STRIP.tensor, STRIP.start, STRIP.count);
    expect(run.strip.full).toEqual(f16.values);
    expect(run.strip.q8).toEqual(int8.values);
    expect(run.strip.q.map((q) => q * run.strip.scale)).toEqual(run.strip.q8);
    // Rounding moves no weight by more than half a step.
    run.strip.full.forEach((v, i) =>
      expect(Math.abs(v / run.strip.scale - run.strip.q[i]!)).toBeLessThanOrEqual(0.5 + 1e-3),
    );
  });

  test("the agreement and KL chips are the probe evidence; the Llama chip follows the slider", () => {
    const [llama, agreement, kl] = quantization.stats;
    expect(resolveStat(agreement, q8)).toBe(probe(q8, "q8-agreement"));
    expect(resolveStat(kl, q8)).toBe(probe(q8, "q8-kl"));
    expect(resolveStat(llama, q8, 2)).toBe(evalArith("weightBytes", { weightBytes: 2 }));
    expect(resolveStat(llama, q8, 1)).toBe(evalArith("weightBytes", { weightBytes: 1 }));
    expect(validateChapter(quantization)).toEqual([]);
  });

  test("the 8-bit crate's height is the measured byte ratio; the words are each model's", () => {
    expect(run.byteRatio).toBe(probe(q8, "q8-bytes"));
    const { input, tags } = frameAt(20);
    const ratio =
      part(input.scene, "crate.8").transform[5]! / part(input.scene, "crate.16").transform[5]!;
    expect(ratio).toBeCloseTo(run.byteRatio, 6);
    const [prompt] = quantization.loop.inputs!;
    const words = (m: LoadedModel) => {
      const t = transformerModel(m);
      const steps = generate(t, promptTokens(t.tokenizer, prompt!), {
        maxNewTokens: CONTINUE_WORDS,
        temperature: 0,
        rng: seededRng(0),
      });
      return [...steps].map((s) => t.tokenizer.decode([s.token]));
    };
    expect(run.full).toEqual(words(full));
    expect(run.q8).toEqual(words(q8));
    expect(tags[0]).toContain(words(full).join(""));
  });

  test("the magnifier shows the weight rounding moves most, snapping onto the grid", () => {
    const i = lensIndex(run.strip);
    const offs = run.strip.full.map((v, k) => Math.abs(v / run.strip.scale - run.strip.q[k]!));
    expect(offs[i]).toBe(Math.max(...offs));
    const before = part(frameAt(1).input.scene, "lens.marker").transform[13]!;
    const after = part(frameAt(8).input.scene, "lens.marker").transform[13]!;
    const lens = part(frameAt(8).input.scene, "lens").transform[13]!;
    expect(after).toBeCloseTo(lens, 6);
    expect(Math.abs(before - lens)).toBeGreaterThan(0.01);
  });

  test("the hero frame's parts, and the failure beat's words", () => {
    const { input } = frameAt(quantization.ogTimeSec);
    expect(input.scene.parts.map((p) => [p.id, p.kind, p.slot])).toMatchSnapshot();
    expect(frameAt(20).tags[0]).toEndWith("still one word per trip");
  });

  test("the point lands by 10 s and the last beat is the failure", () => {
    const beat = (id: string) => quantization.loop.beats.find((b) => b.id === id)!.t;
    expect(beat("round")).toBeLessThan(10);
    expect(beat("crate")).toBeLessThan(10);
    expect(quantization.loop.beats.at(-1)!.id).toBe("one-per-trip");
  });
});
