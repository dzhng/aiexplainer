import { describe, expect, test } from "bun:test";
import {
  evalArith,
  forward,
  parameterCounts,
  probeResult,
  promptTokens,
  transformerModel,
} from "@repo/llm";
import { TRIAGE_SLOTS } from "@repo/renderer";
import { shippedModel } from "../scripts/shipped.ts";
import { ROUTED_TOKENS, ROUTER_LAYER, experts } from "../src/chapters/data/experts.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { validateChapter } from "../src/chapters/validate.ts";
import type { ExpertsRun } from "../src/scene/build-frame.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { chapterRun, frameAt, textOf } from "./scene-harness.ts";

const moe = await shippedModel("moe");
const run = (await chapterRun(experts)) as ExpertsRun;
const lit = (intensity: Float32Array) =>
  Array.from({ length: 8 }, (_, e) => e).filter((e) => intensity[TRIAGE_SLOTS.lamps + e]! > 0);

describe("chapter 14's numbers equal their sources", () => {
  test("each word's two bays and weights are the router's own, from the forward trace", () => {
    const model = transformerModel(moe);
    const ids = promptTokens(model.tokenizer, experts.loop.inputs![0]!);
    const { trace } = forward(model, ids, { trace: { layers: [ROUTER_LAYER] } });
    const router = trace!.layers[ROUTER_LAYER]!.router!;
    expect(run.tokens).toHaveLength(ROUTED_TOKENS);
    run.tokens.forEach((token, n) => {
      const row = n + 1; // after <bos>
      expect(token.text).toBe(model.tokenizer.decode([ids[row]!]));
      expect(token.experts).toEqual(Array.from(router.experts.data.subarray(row * 2, row * 2 + 2)));
      expect(token.weights).toEqual(Array.from(router.weights.data.subarray(row * 2, row * 2 + 2)));
    });
  });

  test("the lit bays are exactly the word's two experts; the other six stay dark", () => {
    // Every word the loop routes, at each moment its copies stand in their bays.
    const routed = new Set<number>();
    const tl = createTimelineState(experts.loop);
    for (let t = 0; t < experts.loop.durationSec; t += 0.05) {
      const c = evalTimeline(experts.loop, t, tl).channels;
      if ((c.route ?? 0) < 0.999 || (c.usage ?? 0) > 0) continue;
      const n = Math.round(c.token ?? 0);
      const { intensity } = frameAt(experts, run, t);
      expect(lit(intensity)).toEqual([...run.tokens[n]!.experts].sort((a, b) => a - b));
      routed.add(n);
    }
    expect(routed.size).toBe(ROUTED_TOKENS);
    // Between words, with the copies still at the desk, no bay is lit.
    expect(lit(frameAt(experts, run, 0.2).intensity)).toEqual([]);
  });

  test("a routed word's weights are written in its two bays, and the desk names them", () => {
    const { scene } = frameAt(experts, run, experts.ogTimeSec);
    const c = evalTimeline(experts.loop, experts.ogTimeSec, createTimelineState(experts.loop));
    const token = run.tokens[Math.round(c.channels.token ?? 0)]!;
    const weights = Array.from({ length: 8 }, (_, e) => textOf(scene, `weight.${e}`));
    token.experts.forEach((e, j) => {
      expect(weights[e]!.text).toBe(`${Math.round(token.weights[j]! * 100)}%`);
      expect(weights[e]!.part).toBe(`triage.bay.${e}`);
    });
    expect(weights.filter((w) => w.text).length).toBe(2);
    expect(textOf(scene, "desk").text).toContain(
      `bays ${token.experts.map((e) => e + 1).join(" and ")}`,
    );
    expect(textOf(scene, "number.2")).toMatchObject({ text: "3", part: "triage.bay.2.floor" });
  });

  test("the usage histogram is the export gate's evidence", () => {
    run.usage.forEach((share, e) =>
      expect(share).toBe(probeResult(moe.manifest, `expert-usage-${e}`).value),
    );
    expect(run.usage.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  test("the chips: the tiny model's weights, its per-word share, and the named Llama assumption", () => {
    const [total, perWord, llama] = experts.stats;
    const counts = parameterCounts(moe);
    expect(resolveStat(total, moe)).toBe(counts.total);
    expect(resolveStat(perWord, moe)).toBe(counts.perToken);
    // Six of eight experts' SwiGLU weights, in each of the 4 layers, sit idle for a token.
    const arch = moe.manifest.kind === "transformer" ? moe.manifest.arch : null;
    expect(counts.total - counts.perToken).toBe(4 * 6 * 3 * arch!.dModel * 128);
    expect(resolveStat(llama, moe)).toBe(evalArith("moeActiveParams", { experts: 8, topK: 2 }));
    expect(validateChapter(experts)).toEqual([]);
  });
});

describe("chapter 14's loop", () => {
  test("the point lands by 10 s; the last beat hands on to the finished machine", () => {
    const beat = (id: string) => experts.loop.beats.find((b) => b.id === id)!.t;
    expect(beat("route")).toBeLessThan(10);
    expect(experts.loop.beats.at(-1)!.id).toBe("last-part");
  });
});
