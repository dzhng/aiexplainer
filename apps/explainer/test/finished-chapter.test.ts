import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalArith, parameterCounts } from "@repo/llm";
import { parseGlb, type SceneDesc } from "@repo/renderer";
import path from "node:path";
import { CHAPTERS } from "../src/chapters/index.ts";
import { STATIONS, arrivesAt, finished, wholeAgainAt } from "../src/chapters/data/finished.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { LOOP_SEC, validateChapter } from "../src/chapters/validate.ts";
import { ARRIVAL_SEC } from "../src/runtime/arrival.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { SCENE_BUILDERS, type FinishedRun, type SceneUi } from "../src/scene/build-frame.ts";
import { stationOrigin } from "../src/scene/builders/finished.ts";
import { shotPose } from "../src/scene/shots.ts";
import { chapterRun, fixtureRun, frameAt, shippedModel } from "./scene-harness.ts";

const publicDir = path.resolve(import.meta.dirname, "../public");
const prop = async (file: string) =>
  parseGlb(await Bun.file(path.join(publicDir, "props", file)).arrayBuffer());
const assets: SceneDesc["assets"] = {
  board: await prop("counter_board.glb"),
  bus: await prop("bus.glb"),
};
// Every frame here builds all thirteen stations, and one test runs every chapter's model.
setDefaultTimeout(60_000);
const run = (await fixtureRun(finished)) as FinishedRun;
const ui: SceneUi = { follow: null, slider: 1, sliderSet: false, view: "whole", text: null };
const tlAt = (t: number) => evalTimeline(finished.loop, t, createTimelineState(finished.loop));
const settled = (n: number) => arrivesAt(n) + 0.3;

describe("the finished machine is the other chapters' scenes, composed", () => {
  test("its stations are every other written chapter, once each", () => {
    const others = Object.keys(CHAPTERS).filter((slug) => slug !== "finished");
    expect(STATIONS.map((s): string => s.def.slug).sort()).toEqual(others.sort());
    for (const { def } of STATIONS) expect(CHAPTERS[def.slug]).toBe(def);
  });

  test("its parts are exactly the union of each station's own builder's parts, placed", () => {
    const t = settled(3);
    const whole = frameAt(finished, run, t, {}, assets).scene;
    // No part of its own, and no part twice.
    expect(new Set(whole.parts.map((p) => p.id)).size).toBe(whole.parts.length);
    let count = 0;
    STATIONS.forEach(({ def, scale }, n) => {
      const own = frameAt(
        def,
        run.runs[def.slug] ?? null,
        def.ogTimeSec + t - arrivesAt(n),
        {},
        assets,
      ).scene;
      const prefix = `${def.slug}/`;
      const mine = whole.parts.filter((p) => p.id.startsWith(prefix));
      expect(mine.map((p) => [p.id.slice(prefix.length), p.kind, p.primitive])).toEqual(
        own.parts.map((p) => [p.id, p.kind, p.primitive]),
      );
      const at = stationOrigin(n);
      mine.forEach((copy, i) => {
        const m = own.parts[i]!.transform;
        // Scaled about the station's own origin, then moved to its place on the floor.
        expect(copy.transform[0]).toBeCloseTo(m[0]! * scale, 6);
        expect(copy.transform[12]).toBeCloseTo(m[12]! * scale + at[0], 6);
        expect(copy.transform[14]).toBeCloseTo(m[14]! * scale + at[2], 6);
      });
      count += mine.length;
    });
    expect(count).toBe(whole.parts.length);
  });

  test("its kit is the other scenes' kit, and nothing else", () => {
    const whole = frameAt(finished, run, 1, {}, assets).scene;
    const theirs = new Set(STATIONS.flatMap(({ def }) => SCENE_KIT[def.scene]));
    expect(new Set(SCENE_KIT.finished)).toEqual(theirs);
    for (const part of whole.parts) expect(theirs.has(part.primitive!)).toBe(true);
  });
});

describe("chapter 15's numbers equal their sources", () => {
  test("each station's run is its own chapter's run, on its own model", async () => {
    const fresh = (await chapterRun(finished)) as FinishedRun;
    for (const { def } of STATIONS) {
      const own = def.model === null ? null : await chapterRun(def);
      expect(fresh.runs[def.slug] ?? null).toEqual(own);
      expect(run.runs[def.slug] ?? null).toEqual(own === null ? null : await fixtureRun(def));
    }
  });

  test("the chips: the full tiny model's weights, and Llama-3-8B's weights and blocks", async () => {
    const full = await shippedModel("full");
    const [tiny, llama, blocks] = finished.stats;
    expect(resolveStat(tiny, full)).toBe(parameterCounts(full).total);
    expect(resolveStat(llama, full)).toBe(evalArith("params", {}));
    expect(resolveStat(blocks, full)).toBe(evalArith("layers", {}));
    expect(validateChapter(finished)).toEqual([]);
  });

  test("each station shows its own chapter's label, word for word", () => {
    STATIONS.forEach(({ def, label }, n) => {
      const own = def.labels.find((l) => l.anchor === label)!;
      expect({ ...finished.labels[n]! }).toEqual({ ...own, anchor: def.slug as typeof own.anchor });
    });
  });
});

describe("the tour", () => {
  const builder = SCENE_BUILDERS.finished;
  const pose = () => ({
    target: [0, 0, 0] as [number, number, number],
    yaw: 0,
    pitch: 0,
    distance: 1,
    fovY: 1,
  });

  test("at each stop only that station's label and scene text show, and it outshines the rest", () => {
    STATIONS.forEach(({ def }, n) => {
      const { scene, frame, intensity } = frameAt(finished, run, settled(n), {}, assets);
      expect(scene.anchors.map((a) => a.id)).toEqual([def.slug]);
      expect(scene.anchors[0]!.part.startsWith(`${def.slug}/`)).toBe(true);
      frame.tags.text.forEach((text, i) => {
        if (text) expect(frame.tags.anchors[i]!.part.startsWith(`${def.slug}/`)).toBe(true);
      });
      const slotOf = (slug: string) =>
        scene.parts.find((p) => p.id.startsWith(`${slug}/`) && intensity[p.slot]! > 0)!.slot;
      const other = STATIONS[(n + 1) % STATIONS.length]!.def.slug;
      const own = frameAt(def, run.runs[def.slug] ?? null, def.ogTimeSec + 0.3, {}, assets);
      const mine = slotOf(def.slug);
      const base = scene.parts.find((p) => p.slot === mine)!;
      const ownSlot = own.scene.parts.find((p) => `${def.slug}/${p.id}` === base.id)!.slot;
      expect(intensity[mine]!).toBeGreaterThan(own.intensity[ownSlot]!);
      expect(intensity[slotOf(other)]!).toBeLessThan(1);
    });
  });

  test("the camera frames each station with its own shot, scaled down; the ends are the wide shot", () => {
    STATIONS.forEach(({ def, scale, shot }, n) => {
      const got = builder.tourPose!(finished, tlAt(arrivesAt(n) + 0.1), ui, pose());
      const own = shotPose(shot ?? def.shot);
      const at = stationOrigin(n);
      expect(got.distance).toBeCloseTo(own.distance * scale, 6);
      expect(got.target[0]).toBeCloseTo(at[0] + own.target[0] * scale, 6);
      expect(got.yaw).toBeCloseTo(own.yaw, 6);
    });
    for (const t of [0.5, wholeAgainAt + 0.5]) {
      const got = builder.tourPose!(finished, tlAt(t), ui, pose());
      const wide = shotPose(finished.shot);
      expect(got.distance).toBeCloseTo(wide.distance, 9);
      got.target.forEach((v, i) => expect(v).toBeCloseTo(wide.target[i]!, 9));
      expect(got.yaw).toBeCloseTo(wide.yaw, 9);
      expect(frameAt(finished, run, t, {}, assets).scene.anchors).toEqual([]);
    }
  });

  test("the slider holds the tour on a station", () => {
    const { scene } = frameAt(finished, run, 0.5, { slider: 4, sliderSet: true }, assets);
    expect(scene.anchors.map((a) => a.id)).toEqual([STATIONS[3]!.def.slug]);
  });
});

describe("pacing", () => {
  test("the loop visits every station within the budget, and lands its point by 10 s", () => {
    const d = finished.loop.durationSec;
    expect(d).toBeGreaterThanOrEqual(LOOP_SEC.min);
    expect(d).toBeLessThanOrEqual(LOOP_SEC.max);
    expect(arrivesAt(0)).toBeLessThan(10);
  });

  test("D21: skimming the ladder (each loop plus its arrival move) takes at most 10 minutes", () => {
    const total = Object.values(CHAPTERS).reduce(
      (sum, def) => sum + def.loop.durationSec + ARRIVAL_SEC,
      0,
    );
    expect(total).toBeLessThanOrEqual(600);
  });
});
