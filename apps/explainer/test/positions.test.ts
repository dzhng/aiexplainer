/**
 * Chapter 5: the clock hands turn by the real RoPE angle, the two orders' pipes and
 * guesses differ, and the difference shown is the `rope` model's own order probe.
 */
import { describe, expect, test } from "bun:test";
import { forward, promptTokens, transformerModel } from "@repo/llm";
import type { BlockPart } from "@repo/renderer";
import path from "node:path";
import { ORDER_PROMPTS } from "../src/chapters/data/attention.ts";
import { positions } from "../src/chapters/data/positions.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import { totalVariation } from "../src/runtime/runs/attention.ts";
import {
  AVERAGE_NOTE,
  CLOCK_PAIR,
  swappedPair,
  type AttentionRun,
} from "../src/scene/builders/attention.ts";
import { shippedContext, shippedModel } from "../scripts/shipped.ts";
import { frameAt } from "./scene-harness.ts";
import { formatStat } from "../src/chapters/format.ts";

const models = path.resolve(import.meta.dirname, "../public/models");
const loaded = await shippedModel("rope");
const model = transformerModel(loaded);
const tokenizer = loaded.tokenizer!;
const ctx = { ...(await shippedContext("rope")), model: loaded };
const run = (await computeRun(positions, null, ctx)) as AttentionRun;

/** A hand's angle clockwise from twelve, read back from its transform (its length axis). */
const handAngle = (hand: BlockPart) => Math.atan2(hand.transform[4]!, hand.transform[5]!);

describe("chapter 5: clock hands turned by position", () => {
  test("the loop's orders and the two Try chips are the rope model's measured order pair", async () => {
    const measured = await Bun.file(path.join(models, "rope/scenarios.json")).json();
    expect(measured.order).toContain(ORDER_PROMPTS.join(" / "));
    expect(positions.loop.inputs).toEqual([...ORDER_PROMPTS]);
    expect(positions.scenarios.map((s) => s.prompt)).toEqual([...ORDER_PROMPTS]);
  });

  test("each chip shows its own order: different pipes, a different guess", async () => {
    const [a, b] = await Promise.all(
      positions.scenarios.map(
        async (s) => ((await computeRun(positions, s.prompt, ctx)) as AttentionRun).steps[0]!,
      ),
    );
    expect(a!.weights).not.toEqual(b!.weights);
    expect(a!.guess.token).not.toBe(b!.guess.token);
  });

  test("hand angles are position × θ, θ from the manifest's ropeTheta and dModel", () => {
    const { arch } = loaded.manifest as {
      arch: { ropeTheta: number; dModel: number; nHeads: number };
    };
    const theta = Math.pow(arch.ropeTheta, (-2 * CLOCK_PAIR) / (arch.dModel / arch.nHeads));
    expect(run.positions!.radPerToken).toBe(theta);
    const { scene } = frameAt(positions, run, positions.ogTimeSec);
    const step = run.steps[0]!;
    for (let i = 0; i <= step.focus; i++) {
      const hand = scene.parts.find((p) => p.id === `dial.${i}.hand`) as BlockPart;
      const want = Math.atan2(Math.sin(i * theta), Math.cos(i * theta));
      expect(handAngle(hand)).toBeCloseTo(want, 6);
    }
  });

  test("the pipes and the guess differ between the orders, by the probe's total variation", () => {
    const [a, b] = run.steps;
    expect(a!.weights).not.toEqual(b!.weights);
    expect(a!.guess.token).not.toBe(b!.guess.token);
    const probe = loaded.manifest.evidence.find(
      (e) => e.probe === "order-sensitivity" && e.prompt === ORDER_PROMPTS.join(" / "),
    )!;
    expect(probe.pass).toBe(true);
    expect(run.positions!.change!).toBeCloseTo(probe.value, 12);
    // And it is the total variation of the model's own two next-word distributions.
    const dist = (prompt: string) => {
      const { logits } = forward(model, promptTokens(tokenizer, prompt));
      const max = Math.max(...logits);
      const e = Array.from(logits, (l) => Math.exp(l - max));
      const sum = e.reduce((s, x) => s + x, 0);
      return e.map((x) => x / sum);
    };
    expect(totalVariation(dist(ORDER_PROMPTS[0]), dist(ORDER_PROMPTS[1]))).toBeCloseTo(
      run.positions!.change!,
      12,
    );
    const text = frameAt(positions, run, 16).frame.tags.text.join("\n");
    expect(text).toContain(formatStat(run.positions!.change!, "pct"));
  });

  test("the pair shown is the swapped words, their angle apart their distance × θ", () => {
    const pair = swappedPair(run.steps)!;
    expect(pair.map((i) => run.steps[0]!.tokens[i])).toEqual([" dog", " cat"]);
    const degrees = Math.round(((pair[1] - pair[0]) * run.positions!.radPerToken * 180) / Math.PI);
    const text = frameAt(positions, run, 9).frame.tags.text;
    expect(text).toContain(`“dog” and “cat”: 3 places, ${degrees}° apart`);
  });

  test("the failure beat: the mix is only an average", () => {
    expect(frameAt(positions, run, 21).frame.tags.text).toContain(AVERAGE_NOTE);
    expect(frameAt(positions, run, 16).frame.tags.text).not.toContain(AVERAGE_NOTE);
  });

  test("the scene builds only from its declared primitives; the point lands by 10 s", () => {
    const { scene } = frameAt(positions, run, positions.ogTimeSec);
    for (const part of scene.parts) expect(SCENE_KIT.positions).toContain(part.primitive!);
    expect(positions.loop.beats.find((b) => b.id === "hands")!.t).toBeLessThan(10);
    expect(positions.loop.beats.find((b) => b.id === "pair")!.t).toBeLessThan(10);
  });
});
