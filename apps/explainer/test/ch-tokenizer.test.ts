import { describe, expect, test } from "bun:test";
import { shippedContext, shippedTokenizer } from "../scripts/shipped.ts";
import { tokenizer as chapter } from "../src/chapters/data/tokenizer.ts";
import { SCENE_KIT } from "../src/chapters/scenes.ts";
import { resolveStat } from "../src/chapters/stats.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import type { PiecesRun } from "../src/scene/build-frame.ts";
import {
  EARLY_IDS,
  FAILURE_PAIR,
  MAX_BRICKS,
  colourOf,
  faceText,
} from "../src/scene/builders/tokenizer.ts";
import { frameAt } from "./scene-harness.ts";

const model = await shippedTokenizer();
const ctx = { ...(await shippedContext("tokenizer")), model };
const runFor = async (text: string | null) => (await computeRun(chapter, text, ctx)) as PiecesRun;
const loopRun = await runFor(null);

/** The scene at loop time `t`: the bricks on show (in pool order) and every tag's text. */
function sceneAt(t: number, run: PiecesRun, text: string | null = null, slider = MAX_BRICKS) {
  const { frame } = frameAt(chapter, run, t, { slider, text });
  const { input } = frame;
  const bodies = input.scene.parts.filter(
    (p) => /^brick\.\w+\.\d+$/.test(p.id) && p.transform[13]! > 0,
  );
  return { input, frame, bodies, tags: frame.tags.text };
}

/** The bricks on show in reading order (back row first, left to right), as their faces read. */
function faces(scene: ReturnType<typeof sceneAt>): string[] {
  const { frame } = scene;
  return scene.bodies
    .map((body) => {
      const i = frame.tags.anchors.findIndex((a) => a.part === body.id);
      return { order: body.transform[12]! + body.transform[14]! * 100, text: frame.tags.text[i]! };
    })
    .sort((a, b) => a.order - b.order)
    .map((f) => f.text);
}

describe("chapter 1: bricks are the real tokenizer's pieces", () => {
  test("every scenario and loop input lays out exactly tokenizer.pieces()", async () => {
    const prompts = [...chapter.scenarios.map((s) => s.prompt), ...chapter.loop.inputs!];
    for (const prompt of prompts) {
      const run = await runFor(prompt);
      const ids = model.tokenizer.encode(prompt);
      const pieces = model.tokenizer.pieces(ids);
      expect(run.steps[0]!.pieces.map((p) => p.text)).toEqual(pieces.map((p) => p.text));
      expect(run.steps[0]!.pieces.map((p) => p.id)).toEqual([...ids]);
      // Settled (typed), every piece is on show, reading its piece and its id.
      const shown = faces(sceneAt(0, run, prompt));
      const want = run.steps[0]!.pieces.slice(0, MAX_BRICKS).map((p) => faceText(p, true));
      expect(shown).toEqual(want);
    }
  });

  test("the scenarios cite passing tokenizer probes, and the rare word takes its probed pieces", async () => {
    for (const s of chapter.scenarios) {
      const evidence = model.evidence.find((e) => e.probe === s.probe);
      expect(evidence?.pass).toBe(true);
    }
    const rare = model.evidence.find((e) => e.probe === "rare-word-split")!;
    expect(model.tokenizer.encode(` ${rare.prompt}`).length).toBe(rare.value);
    const birdcage = (await runFor(chapter.loop.inputs![1]!)).steps[0]!.pieces;
    expect(birdcage.map((p) => p.text.trim())).toContain("bird");
  });

  test("the hero frame: the sentence's bricks, stamped with their ids", () => {
    const hero = sceneAt(chapter.ogTimeSec, loopRun);
    expect(faces(hero)).toMatchSnapshot();
    expect(hero.bodies.length).toBe(loopRun.steps[1]!.pieces.length);
  });

  test("chapter 0's failure word returns and splits into known bricks", () => {
    const [onse] = loopRun.steps;
    expect(onse!.text).toBe("onse");
    expect(onse!.pieces.length).toBeGreaterThan(1);
    const snap = sceneAt(4.5, loopRun);
    expect(faces(snap)).toEqual(onse!.pieces.map((p) => faceText(p, false)));
  });

  test("the failure beat: cat and kitten are two unrelated ids, and the note reads them", () => {
    const step = loopRun.steps[2]!;
    const [cat, kitten] = FAILURE_PAIR.map((w) => step.pieces.find((p) => p.text.trim() === w)!);
    expect(cat!.id).not.toBe(kitten!.id);
    const failure = sceneAt(20, loopRun);
    const note = failure.tags.at(-1)!;
    expect(note).toContain(String(cat!.id));
    expect(note).toContain(String(kitten!.id));
    // The pair glows, the rest do not.
    const glowing = failure.bodies.filter((b) => failure.input.dynamics.intensity[b.slot]! > 0);
    expect(glowing.length).toBe(2);
  });

  test("the slider shows the first N bricks", async () => {
    const run = await runFor(chapter.scenarios[0]!.prompt);
    expect(sceneAt(0, run, chapter.scenarios[0]!.prompt, 3).bodies.length).toBe(3);
  });

  test("the loop's seam: nothing is on the plate at its start or its end", () => {
    expect(sceneAt(0, loopRun).bodies.length).toBe(0);
    expect(sceneAt(chapter.loop.durationSec - 1e-6, loopRun).bodies.length).toBe(0);
  });

  test("the point lands by 10 s: the rare word is in bricks and stamped", () => {
    const at = sceneAt(9.8, loopRun);
    expect(faces(at).every((f) => f.includes("\n"))).toBe(true);
    expect(faces(at).length).toBe(loopRun.steps[1]!.pieces.length);
  });
});

describe("chapter 1's numbers and colours are the tokenizer's", () => {
  test("the chips: the tokenizer's vocabulary, its measured characters per token, Llama's vocabulary", () => {
    const [vocab, chars, llama] = chapter.stats;
    expect(resolveStat(vocab, model)).toBe(model.tokenizer.vocabSize);
    expect(resolveStat(chars, model)).toBe(
      model.evidence.find((e) => e.probe === "chars-per-token")!.value,
    );
    expect(resolveStat(llama, model)).toBe(128256);
    expect(loopRun.vocab).toBe(model.tokenizer.vocabSize);
  });

  test("colour follows merge order: an early id is a merge learned before a later one", async () => {
    // Every multi-byte piece's id orders by its BPE merge rank, so a low id is a common merge.
    const tokenizerJson = await Bun.file(
      new URL("../public/models/tokenizer/tokenizer.json", import.meta.url),
    ).json();
    const { vocab, merges } = tokenizerJson as { vocab: string[]; merges: [number, number][] };
    const mergedIds = merges.map(([a, b]) => vocab.indexOf(vocab[a]! + vocab[b]!));
    for (let i = 1; i < mergedIds.length; i++)
      expect(mergedIds[i]!).toBeGreaterThan(mergedIds[i - 1]!);
    expect(colourOf({ id: 68, text: "c", bytes: 1 })).toBe("brickLetter");
    expect(colourOf({ id: EARLY_IDS - 1, text: " x", bytes: 2 })).toBe("brickEarly");
    expect(colourOf({ id: EARLY_IDS, text: " x", bytes: 2 })).toBe("brickLate");
  });

  test("the scene builds only from the primitives its scene declares", () => {
    const { input } = sceneAt(chapter.ogTimeSec, loopRun);
    for (const part of input.scene.parts) expect(SCENE_KIT.tokenizer).toContain(part.primitive!);
  });
});
