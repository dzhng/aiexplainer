import { describe, expect, test } from "bun:test";
import { evalArith } from "@repo/llm";
import { parseGlb, type BlockPart, type SceneDesc } from "@repo/renderer";
import path from "node:path";
import { BUS_ARITH, PREFILL_TOKENS, batching } from "../src/chapters/data/batching.ts";
import { formatStat } from "../src/chapters/format.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat, statSource, statText } from "../src/chapters/stats.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { validateChapter } from "../src/chapters/validate.ts";
import { buildFrame, createSceneFrame, type SceneUi } from "../src/scene/build-frame.ts";
import { busCapacity, occupancy, PER_SPOT, SEATS } from "../src/scene/builders/batching.ts";

const bus = parseGlb(
  await Bun.file(path.resolve(import.meta.dirname, "../public/props/bus.glb")).arrayBuffer(),
);

function frameAt(t: number, ui: Partial<SceneUi> = {}) {
  const assets: SceneDesc["assets"] = { bus };
  const frame = createSceneFrame({
    camera: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5, fovY: 0.7 },
    view: { mode: "whole", t: 0 },
    scene: { revision: 0, parts: [], anchors: [], assets },
    dynamics: {
      intensity: new Float32Array(1),
      widthScale: new Float32Array(1),
      flowPhase: new Float32Array(1),
    },
  });
  const tl = evalTimeline(batching.loop, t, createTimelineState(batching.loop));
  const full: SceneUi = {
    follow: null,
    slider: batching.slider.initial,
    sliderSet: false,
    view: "whole",
    text: null,
    ...ui,
  };
  const input = buildFrame(batching, tl, full, null, frame);
  return { input, tl, tags: frame.tags.text };
}

/** How many `<prefix>.<n>` cubes stand above the floor (hidden ones wait below it). */
const shown = (scene: SceneDesc, prefix: string) =>
  scene.parts.filter((p) => p.id.startsWith(`${prefix}.`) && (p as BlockPart).transform[13]! > 0)
    .length;

const args = (batch: number) => ({ batch, ...BUS_ARITH });

describe("chapter 11's chips are arithmetic that follows the slider", () => {
  test("every chip equals its arith output across the slider range", () => {
    const [rider, all, full] = batching.stats;
    for (let batch = batching.slider.min; batch <= batching.slider.max; batch += 17) {
      expect(resolveStat(rider, null, batch)).toBe(
        evalArith("decodeCeilingTokPerSec", args(batch)),
      );
      expect(resolveStat(all, null, batch)).toBe(evalArith("batchThroughput", args(batch)));
      expect(resolveStat(full, null, batch)).toBe(evalArith("computeBoundBatch", BUS_ARITH));
    }
  });

  test("no chip reads a model, a probe or the clock: only the slider moves them", () => {
    for (const stat of batching.stats) {
      expect(stat.value.kind).toBe("arith");
      expect(statText(stat, null, 64)).toBe(statText(stat, null, 64));
      expect(statSource(stat, null)).toStartWith("Arithmetic:");
    }
    expect(() => resolveStat(batching.stats[0], null)).toThrow("follows the slider");
  });

  test("one rider's ceiling is about 208 tok/s; the total rises, then flattens past the knee", () => {
    const [rider, all] = batching.stats;
    expect(resolveStat(rider, null, 1)).toBeCloseTo(208.6, 0);
    const knee = busCapacity();
    expect(knee).toBeGreaterThan(295);
    expect(knee).toBeLessThan(batching.slider.max);
    const total = (b: number) => resolveStat(all, null, b);
    expect(total(64) / total(1)).toBeGreaterThan(60);
    expect(total(batching.slider.max) / total(Math.ceil(knee))).toBeCloseTo(1, 3);
  });

  test("the validator accepts slider and probe bindings, and rejects a probe without a model", () => {
    expect(validateChapter(batching)).toEqual([]);
    const withProbe = structuredClone(batching);
    withProbe.stats[2] = {
      ...withProbe.stats[2],
      value: { kind: "arith", fn: "specExpectedTokens", args: { alpha: { probe: "x" }, k: 4 } },
      format: "x",
    };
    expect(validateChapter(withProbe)).toContain(
      "stat bus-full: alpha reads a probe but the chapter has no model",
    );
  });
});

describe("chapter 11's scene", () => {
  test("one cube per rider: riders past the arithmetic capacity wait at the stop", () => {
    const capacity = busCapacity();
    expect(SEATS * PER_SPOT).toBeGreaterThanOrEqual(Math.floor(capacity));
    for (const riders of [1, 20, 164, Math.floor(capacity), 400, 512]) {
      const { seated, waiting } = occupancy(riders, capacity);
      expect(seated + waiting).toBe(riders);
      expect(seated).toBe(Math.min(riders, Math.floor(capacity)));
      const { input } = frameAt(0, { slider: riders, sliderSet: true });
      expect(shown(input.scene, "rider")).toBe(seated);
      expect(shown(input.scene, "waiting")).toBe(waiting);
    }
  });

  test("the slider replaces the loop's riders once the reader moves it", () => {
    const loop = frameAt(3);
    expect(loop.tags[0]).toStartWith("1 rider ·");
    expect(shown(loop.input.scene, "rider")).toBe(1);
    const set = frameAt(3, { slider: 200, sliderSet: true });
    expect(set.tags[0]).toStartWith("200 riders ·");
    expect(shown(set.input.scene, "rider")).toBe(200);
  });

  test("prefill seats one prompt's tokens and no riders", () => {
    const { input } = frameAt(15);
    expect(shown(input.scene, "token")).toBe(PREFILL_TOKENS);
    expect(shown(input.scene, "rider")).toBe(0);
  });

  test("every number the scene writes is the arithmetic for what it shows", () => {
    const t = 10;
    const { tl, tags } = frameAt(t);
    const riders = Math.round(tl.channels.batch!);
    expect(riders).toBeGreaterThan(busCapacity());
    expect(tags[0]).toBe(
      `${riders} riders · ${formatStat(evalArith("batchThroughput", args(riders)), "tok/s")} in total\none trip: ${formatStat(evalArith("decodeStepSeconds", args(riders)), "s")}`,
    );
    expect(tags[2]).not.toBe("");
    const prefill = frameAt(15).tags[0]!;
    const seconds = evalArith("prefillSeconds", {
      tokens: PREFILL_TOKENS,
      weightBytes: BUS_ARITH.weightBytes,
      kvBytes: BUS_ARITH.kvBytes,
    });
    expect(prefill).toContain(`${PREFILL_TOKENS}-token prompt`);
    expect(prefill).toContain(formatStat(seconds, "s"));
    const heavy = frameAt(20).tags[1]!;
    expect(heavy).toStartWith(formatStat(evalArith("weightBytes", { weightBytes: 2 }), "bytes"));
  });

  test("the point lands by 10 s, and the loop's last beat is the heavy crates", () => {
    const beat = (id: string) => batching.loop.beats.find((b) => b.id === id)!.t;
    expect(beat("one-rider")).toBeLessThan(10);
    expect(beat("fill")).toBeLessThan(10);
    expect(batching.loop.beats.at(-1)!.id).toBe("heavy");
  });

  test("the scene is the bus, a cube per rider place, prompt tokens, the queue, crates and stop", () => {
    const { input } = frameAt(10);
    const groups: Record<string, number> = {};
    for (const p of input.scene.parts) {
      const group = p.kind === "mesh" ? p.id : `${p.id.split(".")[0]} (${p.kind}, slot ${p.slot})`;
      groups[group] = (groups[group] ?? 0) + 1;
    }
    expect(groups).toMatchSnapshot();
    const declared = SCENE_KIT[batching.scene];
    for (const part of input.scene.parts) expect(declared).toContain(part.primitive!);
  });
});
