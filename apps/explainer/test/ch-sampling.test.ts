import { describe, expect, test } from "bun:test";
import {
  forward,
  probabilities,
  promptTokens,
  sample,
  seededRng,
  transformerModel,
} from "@repo/llm";
import { directSession } from "../scripts/direct-session.ts";
import { shippedModel } from "../scripts/shipped.ts";
import { sampling as chapter } from "../src/chapters/data/sampling.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import { buildFrame, createSceneFrame, type SceneRun } from "../src/scene/build-frame.ts";
import {
  ROLL_SEED,
  WORD_FACES,
  entropyBits,
  faceRead,
  faceShares,
  landingAngle,
} from "../src/scene/builders/sampling.ts";

const loaded = await shippedModel("embed");
const model = transformerModel(loaded);
const tokenizer = loaded.tokenizer!;
const ctx = { model: loaded, session: directSession(loaded) };
type LogitsRun = Extract<SceneRun, { kind: "logits" }>;
const runFor = async (text: string | null) => (await computeRun(chapter, text, ctx)) as LogitsRun;
const loopRun = await runFor(null);
const FACES = WORD_FACES + 1;
const STAVES = 12;

function sceneAt(
  t: number,
  run: LogitsRun,
  slider = chapter.slider.initial,
  text: string | null = null,
) {
  const frame = createSceneFrame({
    camera: { target: [0, 1, 0], yaw: -0.3, pitch: 0.35, distance: 5, fovY: 0.7 },
    view: { mode: "whole", t: 0 },
    scene: { revision: 0, parts: [], anchors: [], assets: {} },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  });
  const tl = evalTimeline(chapter.loop, t, createTimelineState(chapter.loop));
  const input = buildFrame(chapter, tl, { follow: null, slider, view: "whole", text }, run, frame);
  return { input, frame, tl };
}

/** Each face's share of the rim, measured from its staves' transforms: the angle they span. */
function rimShares(input: ReturnType<typeof sceneAt>["input"]): number[] {
  const radius = 0.3;
  return Array.from({ length: FACES }, (_, f) => {
    let angle = 0;
    for (let s = 0; s < STAVES; s++) {
      const t = input.scene.parts.find((p) => p.id === `die.face.${f}.${s}`)!.transform;
      // The stave's tangential axis is its width: 2 r tan(step / 2).
      const width = Math.hypot(t[8]!, t[9]!, t[10]!);
      angle += 2 * Math.atan(width / (2 * radius));
    }
    return angle / (2 * Math.PI);
  });
}

describe("chapter 3: the die is the model's own distribution", () => {
  test("the run's scores are the forward pass after each loop prompt", () => {
    chapter.loop.inputs!.forEach((prompt, i) => {
      const logits = forward(model, promptTokens(tokenizer, prompt)).logits;
      const step = loopRun.steps[i]!;
      expect(step.logits.length).toBe(logits.length);
      for (let k = 0; k < logits.length; k += 97) expect(step.logits[k]!).toBe(logits[k]!);
      expect(step.top[0]!.logit).toBe(Math.max(...logits));
    });
  });

  test("face areas equal probabilities(logits, T) for the top six plus “other”, at any temperature", () => {
    const step = loopRun.steps[0]!;
    for (const t of [0.3, 1, 2]) {
      // Held on a still moment (the die formed and landed), with the slider moved to t.
      const { input } = sceneAt(8.5, loopRun, t);
      const probs = probabilities(step.logits, t);
      const want = step.top.slice(0, WORD_FACES).map((w) => probs[w.id]!);
      want.push(1 - want.reduce((a, b) => a + b, 0));
      rimShares(input).forEach((share, f) => expect(share).toBeCloseTo(want[f]!, 5));
    }
  });

  test("with a held seed, the landed face equals sample() over the faces", () => {
    const step = loopRun.steps[0]!;
    const shares = faceShares(step, probabilities(step.logits, 1), []);
    for (let n = 0; n < 3; n++) {
      const sampled = sample(shares, seededRng(ROLL_SEED + n));
      expect(faceRead(shares, landingAngle(n))).toBe(sampled);
    }
    // The loop's first roll lands on that face and says so.
    const landed = sceneAt(8, loopRun);
    const face = sample(shares, seededRng(ROLL_SEED));
    expect(landed.frame.tags.text[0]).toContain(
      face < WORD_FACES ? `“${step.top[face]!.text.trim()}”` : "other words",
    );
  });

  test("temperature changes the spread the way the model's probe says: cold is sharper, hot flatter", () => {
    const step = loopRun.steps[0]!;
    const h = [0.5, 1, 1.5].map((t) => entropyBits(probabilities(step.logits, t)));
    expect(h[0]!).toBeLessThan(h[1]!);
    expect(h[1]!).toBeLessThan(h[2]!);
    // The loop's cold beat shows the top face all but alone.
    const cold = rimShares(sceneAt(11.5, loopRun).input);
    expect(cold[0]!).toBeGreaterThan(0.95);
  });

  test("the failure: two stories ending in “it” roll exactly the same die", () => {
    const [, a, b] = loopRun.steps;
    expect(a!.text).not.toBe(b!.text);
    expect(a!.last).toBe(b!.last);
    expect(a!.logits).toEqual(b!.logits);
  });
});

describe("chapter 3's numbers and loop", () => {
  test("the chips: the sampling probe, the vocabulary, Llama's vocabulary", () => {
    const [top, faces, llama] = chapter.stats;
    expect(resolveStat(top, loaded)).toBe(
      loaded.manifest.evidence.find((e) => e.probe === "sampling-peaked")!.value,
    );
    expect(resolveStat(faces, loaded)).toBe(4096);
    expect(resolveStat(llama, loaded)).toBe(128256);
    for (const s of chapter.scenarios)
      expect(loaded.manifest.evidence.find((e) => e.probe === s.probe)?.pass).toBe(true);
  });

  test("the point lands by 10 s: the die has rolled and landed", () => {
    const at = sceneAt(9.5, loopRun);
    expect(at.tl.channels.roll).toBe(1);
    expect(chapter.loop.beats.find((b) => b.id === "roll")!.t).toBeLessThan(10);
  });

  test("the hero frame (snapshot of its words)", () => {
    const hero = sceneAt(chapter.ogTimeSec, loopRun);
    expect(hero.frame.tags.text.filter(Boolean)).toMatchSnapshot();
  });

  test("the scene builds only from the primitives its scene declares", () => {
    const { input } = sceneAt(8, loopRun);
    for (const part of input.scene.parts) expect(SCENE_KIT.sampling).toContain(part.primitive!);
  });
});
