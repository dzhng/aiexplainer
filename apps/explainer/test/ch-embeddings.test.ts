import { describe, expect, test } from "bun:test";
import { nearestTokens, transformerModel } from "@repo/llm";
import path from "node:path";
import { directSession } from "../scripts/direct-session.ts";
import { pca, row } from "../scripts/pca.ts";
import { shippedModel } from "../scripts/shipped.ts";
import { embeddings as chapter } from "../src/chapters/data/embeddings.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import { buildFrame, createSceneFrame, type SceneRun } from "../src/scene/build-frame.ts";
import { mapPoint } from "../src/scene/builders/embeddings.ts";
import { EMBED_MAP, projectRow } from "../src/scene/embed-map.ts";

const loaded = await shippedModel("embed");
const model = transformerModel(loaded);
const tokenizer = loaded.tokenizer!;
const d = model.arch.dModel;
const ctx = { model: loaded, session: directSession(loaded) };
type PinsRun = Extract<SceneRun, { kind: "pins" }>;
const runFor = async (text: string | null) => (await computeRun(chapter, text, ctx)) as PinsRun;
const loopRun = await runFor(null);

function sceneAt(t: number, run: PinsRun, text: string | null = null, slider = 60) {
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
  const tl = evalTimeline(chapter.loop, t, createTimelineState(chapter.loop));
  const input = buildFrame(chapter, tl, { follow: null, slider, view: "whole", text }, run, frame);
  const part = (id: string) => input.scene.parts.find((p) => p.id === id)!;
  const shown = (prefix: string) =>
    input.scene.parts.filter(
      (p) => p.id.startsWith(prefix) && p.id.endsWith(".head") && p.transform[13]! > 0,
    );
  return { input, frame, part, shown };
}

describe("chapter 2: the map is the real embedding table's PCA (D37)", () => {
  test("the stored map is for the shipped embed weights", () => {
    expect(EMBED_MAP.model).toBe("embed");
    expect(EMBED_MAP.weightsSha256).toBe(loaded.manifest.weightsSha256);
  });

  test("the stored basis is the PCA of the pinned words' tok_emb rows", () => {
    const refit = pca(
      EMBED_MAP.pins.map((p) => row(model.tokEmb, d, p.id, false)),
      3,
    );
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < d; k++)
        expect(EMBED_MAP.components[c]![k]!).toBeCloseTo(refit.components[c]![k]!, 6);
    for (let k = 0; k < d; k++) expect(EMBED_MAP.mean[k]!).toBeCloseTo(refit.mean[k]!, 6);
  });

  test("every pin sits at the stored PCA of its manifest tok_emb row", () => {
    for (const pin of EMBED_MAP.pins) {
      const at = projectRow(model.tokEmb.subarray(pin.id * d, (pin.id + 1) * d));
      for (let a = 0; a < 3; a++) expect(pin.at[a]!).toBeCloseTo(at[a]!, 5);
      expect([...tokenizer.encode(` ${pin.word}`)]).toEqual([pin.id]);
    }
    // The builder stands every background pin at its stored projection.
    const { part } = sceneAt(0, loopRun);
    EMBED_MAP.pins.forEach((pin, i) => {
      const t = part(`pin.${i}.head`).transform;
      const [x, y, z] = mapPoint(pin.at);
      expect([t[12]!, t[13]! + t[5]! / 2, t[14]!].map((v) => v.toFixed(5))).toEqual(
        [x, y, z].map((v) => v.toFixed(5)),
      );
    });
  });

  test("the pinned pairs are exactly pairs from the embed neighbour probe's set, at most 60 words", async () => {
    const probePairs: [string, string][] = await Bun.file(
      path.resolve(import.meta.dirname, "../../../training/probes/prompts/neighbours.json"),
    ).json();
    const probe = new Set(probePairs.map(([a, b]) => `${a} ${b}`));
    for (const [a, b] of EMBED_MAP.pairs) expect(probe.has(`${a} ${b}`)).toBe(true);
    expect(EMBED_MAP.pins.map((p) => p.word)).toEqual(EMBED_MAP.pairs.flat());
    expect(EMBED_MAP.pins.length).toBeLessThanOrEqual(60);
    // The loop's pair and every scenario are probe pairs too.
    expect(probe.has(chapter.loop.inputs![0]!)).toBe(true);
    for (const s of chapter.scenarios) {
      expect(probe.has(s.prompt)).toBe(true);
      expect(loaded.manifest.evidence.find((e) => e.probe === s.probe)?.pass).toBe(true);
    }
  });
});

describe("chapter 2's numbers come from the model", () => {
  test("the loop's cat and kitten: their pins and their cosine are the model's", () => {
    const [cat, kitten] = loopRun.steps[0]!.pins;
    expect([cat!.text, kitten!.text]).toEqual([" cat", " kitten"]);
    const near = nearestTokens(model, cat!.id, 4096).find((n) => n.token === kitten!.id)!;
    expect(loopRun.steps[0]!.cosine!).toBeCloseTo(near.similarity, 5);
    const note = sceneAt(7, loopRun).frame.tags.text[0]!;
    expect(note).toContain(loopRun.steps[0]!.cosine!.toFixed(2));
  });

  test("the chips: 64 directions, Llama's 4,096, and the neighbour probe", () => {
    const [dims, llama, probe] = chapter.stats;
    expect(resolveStat(dims, loaded)).toBe(64);
    expect(resolveStat(llama, loaded)).toBe(4096);
    expect(resolveStat(probe, loaded)).toBe(
      loaded.manifest.evidence.find((e) => e.probe === "neighbours")!.value,
    );
  });

  test("the failure: a word's pin is the same whatever comes before it", async () => {
    const alone = (await runFor("it")).steps[0]!.pins[0]!;
    const inSentence = (await runFor("the cat sat and then it")).steps[0]!.pins.at(-1)!;
    expect(inSentence.id).toBe(alone.id);
    expect(inSentence.at).toEqual(alone.at);
  });
});

describe("chapter 2's loop", () => {
  test("the hero frame: every pin, the loop's two words down, arrows grown", () => {
    const hero = sceneAt(chapter.ogTimeSec, loopRun);
    expect(hero.shown("word.").length).toBe(2);
    expect(Math.abs(hero.part("pin.4.arrow").transform[0]!)).toBeGreaterThan(0.01);
    expect(hero.frame.tags.text.slice(1, 3)).toEqual(["cat", "kitten"]);
    expect(hero.frame.tags.text.filter(Boolean)).toMatchSnapshot();
  });

  test("the point lands by 10 s: cat and kitten are pins, lit, with their cosine", () => {
    const at = sceneAt(8, loopRun);
    expect(at.shown("word.").length).toBe(2);
    expect(at.input.dynamics.intensity[3]!).toBeGreaterThan(0);
  });

  test("the seam: no input pin and no arrow at the loop's start and end", () => {
    for (const t of [0, chapter.loop.durationSec - 1e-6]) {
      const at = sceneAt(t, loopRun);
      expect(at.shown("word.").length).toBe(0);
      expect(at.part("pin.4.arrow").transform[13]!).toBeLessThan(-10);
    }
  });

  test("the slider pins the first N words", () => {
    expect(sceneAt(12.5, loopRun, null, 10).shown("pin.").length).toBe(10 - 2);
  });

  test("the scene builds only from the primitives its scene declares", () => {
    const { input } = sceneAt(12.5, loopRun);
    for (const part of input.scene.parts) expect(SCENE_KIT.embeddings).toContain(part.primitive!);
  });
});
