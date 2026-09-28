/**
 * Chapter 4: every pipe's width is the real attention weight. The run is computed
 * the way the app computes it (through `computeRun`), and checked against a direct forward
 * pass of the shipped `attn` model.
 */
import { describe, expect, test } from "bun:test";
import { forward, promptTokens, transformerModel } from "@repo/llm";
import { compileScene, VERTEX_BYTES, type SceneDesc, type TubePart } from "@repo/renderer";
import path from "node:path";
import { attention, ORDER_PROMPTS, RECALL_PROMPTS } from "../src/chapters/data/attention.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { look, lookConfig } from "../src/look/look.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import { angleDeg } from "../src/runtime/runs/attention.ts";
import { shippedContext, shippedModel } from "../scripts/shipped.ts";
import {
  FUTURE_WORDS,
  ORDER_NOTE,
  SEALED_NOTE,
  reorderFrom,
  layoutTokens,
  MAX_LINES,
  MAX_TOKENS,
} from "../src/scene/builders/attention.ts";
import { tokenLabel } from "../src/chapters/format.ts";
import {
  buildFrame,
  createSceneFrame,
  type SceneRun,
  type SceneUi,
} from "../src/scene/build-frame.ts";

const models = path.resolve(import.meta.dirname, "../public/models");
const loaded = await shippedModel("attn");
const model = transformerModel(loaded);
const tokenizer = loaded.tokenizer!;
const ctx = { ...(await shippedContext("attn")), model: loaded };

/** The shipped model's own weights from the last token of `prompt`. */
function golden(prompt: string): Float32Array {
  const ids = promptTokens(tokenizer, prompt);
  const { trace } = forward(model, ids, { trace: { tokens: [ids.length - 1] } });
  return trace!.layers[0]!.attn!.weights.data;
}

function frameAt(t: number, run: SceneRun, text: string | null = null) {
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
  const tl = evalTimeline(attention.loop, t, createTimelineState(attention.loop));
  const ui: SceneUi = { follow: null, slider: 3, sliderSet: false, view: "whole", text };
  const input = buildFrame(attention, tl, ui, run, frame);
  return { input, frame };
}

const pipeOf = (scene: SceneDesc, i: number) =>
  scene.parts.find((p) => p.id === `pipe.${i}`) as TubePart;

const run = (await computeRun(attention, null, ctx))!;
const steps = run.kind === "attention" ? run.steps : [];

describe("chapter 4: pipe width is the real attention weight", () => {
  test("the loop's prompt and every scenario are the attn model's measured prompts (O2)", async () => {
    const measured = await Bun.file(path.join(models, "attn/scenarios.json")).json();
    for (const s of attention.scenarios) {
      expect(measured.attention).toContain(s.prompt);
      expect(loaded.manifest.evidence.find((e) => e.probe === s.probe)?.pass).toBe(true);
    }
    expect(attention.loop.inputs).toEqual([RECALL_PROMPTS.mia, ...ORDER_PROMPTS]);
    // The passing per-prompt probe is on the loop's prompt itself.
    const probe = loaded.manifest.evidence.find(
      (e) => e.probe === "recall-attention" && e.prompt === RECALL_PROMPTS.mia,
    );
    expect(probe?.pass).toBe(true);
  });

  test("at the hero time, each pipe's packed widthScale equals the trace's weight", () => {
    const weights = golden(RECALL_PROMPTS.mia);
    const { input } = frameAt(attention.ogTimeSec, run);
    for (let i = 0; i < weights.length; i++) {
      const slot = pipeOf(input.scene, i).slot;
      expect(input.dynamics.widthScale[slot]).toBe(weights[i]!);
    }
    // Pipes past the last token are closed.
    const past = pipeOf(input.scene, weights.length);
    expect(input.dynamics.widthScale[past.slot]).toBe(0);
  });

  test("the widest pipe lands on the name, and it is labelled with its share", () => {
    const weights = golden(RECALL_PROMPTS.mia);
    const step = run.kind === "attention" ? run.steps[0]! : null;
    const widest = weights.indexOf(Math.max(...weights));
    expect(step!.tokens[widest]).toBe(" Mia");
    const { input, frame } = frameAt(attention.ogTimeSec, run);
    const label = input.scene.anchors.find((a) => a.id === "pipes")!;
    expect(label.part).toBe(`pipe.${widest}`);
    expect(frame.tags.text).toContain(`Mia ${Math.round(weights[widest]! * 100)}%`);
  });

  test("CPU mirror: the radii the GPU draws are in the same order as the weights", () => {
    const weights = golden(RECALL_PROMPTS.mia);
    const { input } = frameAt(attention.ogTimeSec, run);
    // The room is not needed to measure the pipes.
    const compiled = compileScene({ ...input.scene, environment: undefined }, lookConfig());
    const stride = VERTEX_BYTES / 4;
    const drawn = Array.from(weights, (_, i) => {
      const pipe = pipeOf(input.scene, i);
      const instance = compiled.instanceParts.indexOf(pipe);
      const draw = compiled.draws.find(
        (d) => instance >= d.firstInstance && instance < d.firstInstance + d.instanceCount,
      )!;
      // The first ring's first vertex, moved as the vertex stage moves it: away from its axis
      // point by widthScale.
      const v = compiled.vertices.subarray(draw.baseVertex * stride);
      const offset = Math.hypot(v[0]! - v[8]!, v[1]! - v[9]!, v[2]! - v[10]!);
      return offset * input.dynamics.widthScale[pipe.slot]!;
    });
    // A wider weight always draws a wider pipe; equal weights (the same word again: this
    // model has no positions) draw equal pipes, to float precision.
    for (let i = 0; i < weights.length; i++)
      for (let j = 0; j < weights.length; j++) {
        if (weights[i]! < weights[j]!) expect(drawn[i]!).toBeLessThan(drawn[j]!);
        if (weights[i] === weights[j]) expect(drawn[i]!).toBeCloseTo(drawn[j]!, 6);
      }
    // The width is proportional to the weight.
    const top = weights.indexOf(Math.max(...weights));
    for (let i = 0; i < weights.length; i++)
      expect(drawn[i]! / drawn[top]!).toBeCloseTo(weights[i]! / weights[top]!, 5);
  });

  test("typed text is tokenized and run the same way, settled at once", async () => {
    const text = "Tom had a red kite. Tom";
    const typed = (await computeRun(attention, text, ctx))!;
    const weights = golden(text);
    const { input } = frameAt(0, typed, text);
    for (let i = 0; i < weights.length; i++)
      expect(input.dynamics.widthScale[pipeOf(input.scene, i).slot]).toBe(weights[i]!);
  });

  test("the longest text the scene holds, in the vocabulary's longest pieces, fits the stand", () => {
    const longest = Math.max(
      ...Array.from(
        { length: tokenizer.vocabSize },
        (_, id) => tokenLabel(tokenizer.decode([id])).length,
      ),
    );
    // Every block as long as the longest piece, and five of them with room for a share.
    const tokens = Array.from({ length: MAX_TOKENS }, (_, i) =>
      "x".repeat(longest + (i < 5 ? 4 : 0)),
    );
    expect(() => layoutTokens(tokens)).not.toThrow();
    expect(layoutTokens(tokens).steps.length).toBeLessThanOrEqual(MAX_LINES);
  });

  test("the point lands by 10 s: widths have settled to the weights before then", () => {
    const settled = attention.loop.channels.settle!.find((k) => k.v === 1)!.t;
    expect(settled).toBeLessThan(10);
    const beat = attention.loop.beats.find((b) => b.id === "widths-settle")!;
    expect(beat.t).toBeLessThan(10);
  });

  test("the scene builds only from the primitives its scene declares", () => {
    const { input } = frameAt(attention.ogTimeSec, run);
    for (const part of input.scene.parts)
      expect(SCENE_KIT[attention.scene]).toContain(part.primitive!);
  });

  test("the hero frame's structure is stable", () => {
    const { input } = frameAt(attention.ogTimeSec, run);
    expect(input.scene.parts.map((p) => [p.id, p.kind, p.slot])).toMatchSnapshot();
  });
});

describe("chapter 4: sealed pipes from the future", () => {
  const step = run.kind === "attention" ? run.steps[0]! : null;
  const miaIds = promptTokens(tokenizer, RECALL_PROMPTS.mia);

  test("the later words are the model's own next words, and the trace gives them exactly 0", () => {
    expect(step!.focus).toBe(miaIds.length - 1);
    expect(step!.tokens.length).toBe(miaIds.length + FUTURE_WORDS);
    // Greedy continuation: each later word is the model's top guess after the ones before it.
    const ids = [...miaIds];
    for (let k = 0; k < FUTURE_WORDS; k++) {
      const { logits } = forward(model, ids);
      const next = logits.indexOf(Math.max(...logits));
      expect(step!.tokens[ids.length]).toBe(tokenizer.decode([next]));
      ids.push(next);
    }
    // The trace over the whole text, from the focus: every later weight is exactly 0 (the
    // causal mask), and the earlier ones are the prompt-only weights, bit for bit.
    const { trace } = forward(model, ids, { trace: { tokens: [step!.focus] } });
    const weights = trace!.layers[0]!.attn!.weights.data;
    for (let i = step!.focus + 1; i < ids.length; i++) expect(weights[i]).toBe(0);
    expect(Array.from(weights.subarray(0, miaIds.length))).toEqual(
      Array.from(golden(RECALL_PROMPTS.mia)),
    );
    expect(step!.weights).toEqual(Array.from(weights));
  });

  test("caps stand only on the words after the focus, and no pipe runs from them", () => {
    const at = (t: number) => frameAt(t, run);
    const sealedOpen = (input: ReturnType<typeof at>["input"]) =>
      Array.from({ length: FUTURE_WORDS }, (_, j) => {
        const cap = input.scene.parts.find((p) => p.id === `sealed.${j}.cap`)!;
        return input.dynamics.widthScale[cap.slot]!;
      });
    // Before the beat the later words are not up; after it, every one has its cap.
    expect(sealedOpen(at(9).input).every((w) => w === 0)).toBe(true);
    const { input, frame } = at(attention.ogTimeSec);
    expect(sealedOpen(input)).toEqual(Array.from({ length: FUTURE_WORDS }, () => 1));
    for (let i = step!.focus + 1; i < step!.tokens.length; i++)
      expect(input.dynamics.widthScale[pipeOf(input.scene, i).slot]).toBe(0);
    // Each cap sits over its own later word, past the focus word in reading order.
    const blocks = Array.from({ length: FUTURE_WORDS }, (_, j) => {
      const block = input.scene.parts.find((p) => p.id === `later.${j}`)!;
      const cap = input.scene.parts.find((p) => p.id === `sealed.${j}`) as TubePart;
      return { x: block.transform[12]!, stub: cap.path[0]![0] };
    });
    for (const b of blocks) expect(b.stub).toBeCloseTo(b.x, 6);
    expect(frame.tags.text).toContain(SEALED_NOTE);
    expect(frame.tags.text).toContain(tokenLabel(step!.tokens.at(-1)!));
  });
});

describe("chapter 4: flow and the failure beat", () => {
  const [dogCat, catDog] = ORDER_PROMPTS;
  const logitsOf = (prompt: string) => forward(model, promptTokens(tokenizer, prompt)).logits;

  test("D35: the order pair is the attn model's measured order probe, and it passes at 0", async () => {
    const measured = await Bun.file(path.join(models, "attn/scenarios.json")).json();
    expect(measured.order).toContain(ORDER_PROMPTS.join(" / "));
    const probe = loaded.manifest.evidence.find(
      (e) => e.probe === "order-invariance" && e.prompt === ORDER_PROMPTS.join(" / "),
    );
    expect(probe?.value).toBe(0);
    expect(probe?.pass).toBe(true);
  });

  test("D35: shuffled and unshuffled last-position logits are bit-identical", () => {
    const a = logitsOf(dogCat);
    const b = logitsOf(catDog);
    expect(promptTokens(tokenizer, dogCat)).not.toEqual(promptTokens(tokenizer, catDog));
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  test("the on-screen claim comes from that run: same guess, same mix, pipes rearranged", () => {
    const [, first, second] = steps;
    // The loop's second and third steps are the two orders, run like the app runs them.
    expect(first!.tokens.slice(0, first!.focus + 1).join("")).toBe(`<bos>${dogCat}`);
    expect(second!.tokens.slice(0, second!.focus + 1).join("")).toBe(`<bos>${catDog}`);
    // The guess each shows is the logits' top word and its share, identical in both orders.
    const logits = logitsOf(dogCat);
    const top = logits.indexOf(Math.max(...logits));
    expect(first!.guess.token).toBe(tokenizer.decode([top]));
    expect(second!.guess).toEqual(first!.guess);
    // The pipes rearrange: each word keeps its weight, wherever it now stands.
    const from = reorderFrom(first!, second!)!;
    expect(from).not.toBeNull();
    for (let i = 0; i <= second!.focus; i++)
      expect(second!.weights[i]).toBe(first!.weights[from[i]!]);
    expect(second!.weights).not.toEqual(first!.weights);
    expect(second!.turn.after).toBe(first!.turn.after);
    // The note shows over the second order only, after its pipes have settled.
    const note = (t: number) => frameAt(t, run).frame.tags.text.includes(ORDER_NOTE);
    expect(note(25)).toBe(true);
    expect(note(19)).toBe(false);
    expect(frameAt(25, run).frame.tags.text).toContain(
      `guess for the next word: “cat”, ${Math.round(first!.guess.p * 100)}% sure`,
    );
  });

  test("pulses ride every pipe at its width, and move with the loop clock", () => {
    const at = (t: number) => frameAt(t, run).input;
    const a = at(attention.ogTimeSec);
    const b = at(attention.ogTimeSec + 0.25);
    for (let i = 0; i <= steps[0]!.focus; i++) {
      const pipe = pipeOf(a.scene, i);
      const flow = a.scene.parts.find((p) => p.id === `flow.${i}`) as TubePart;
      expect(flow.path).toBe(pipe.path);
      expect(a.dynamics.widthScale[flow.slot]).toBe(a.dynamics.widthScale[pipe.slot]!);
      expect(a.dynamics.intensity[flow.slot]).toBeGreaterThan(0);
      expect(b.dynamics.flowPhase[flow.slot]! - a.dynamics.flowPhase[flow.slot]!).toBeCloseTo(
        0.25 * look.flow.cyclesPerSec,
        6,
      );
    }
  });

  test("the needle tilts by the real turn of the focus word's vector toward its referent", () => {
    const mia = steps[0]!;
    const ids = promptTokens(tokenizer, RECALL_PROMPTS.mia);
    const { trace } = forward(model, ids, { trace: {} });
    const res = trace!.layers[0]!.attn!.residual;
    const d = res.residualIn.shape[1]!;
    const row = (t: { data: Float32Array }, i: number) => t.data.subarray(i * d, (i + 1) * d);
    expect(mia.tokens[mia.turn.referent]).toBe(" Mia");
    const target = row(res.residualIn, mia.turn.referent);
    expect(mia.turn.before).toBeCloseTo(angleDeg(row(res.residualIn, mia.focus), target), 9);
    expect(mia.turn.after).toBeCloseTo(angleDeg(row(res.sum, mia.focus), target), 9);
    expect(mia.turn.after).toBeLessThan(mia.turn.before);
    const shown = frameAt(attention.ogTimeSec, run).frame.tags.text;
    expect(shown).toContain(`${Math.round(mia.turn.before - mia.turn.after)}° closer to “Mia”`);
  });
});
