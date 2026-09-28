import { describe, expect, test } from "bun:test";
import {
  evalArith,
  parameterCounts,
  probeResult,
  promptTokens,
  seededRng,
  speculate,
  transformerModel,
} from "@repo/llm";
import { shippedContext, shippedModel } from "../scripts/shipped.ts";
import { SPEC_RUN, speculative } from "../src/chapters/data/speculative.ts";
import { resolveStat, statSource } from "../src/chapters/stats.ts";
import { validateChapter } from "../src/chapters/validate.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import type { SpeculativeRun } from "../src/scene/build-frame.ts";
import { roundView, storyAfter } from "../src/scene/builders/speculative.ts";
import { frameAt, textOf, texts } from "./scene-harness.ts";

const drafter = await shippedModel("drafter-64");
const full = await shippedModel("full");
const run = (await computeRun(
  speculative,
  null,
  await shippedContext("drafter-64"),
)) as SpeculativeRun;
const k4 = run.byK.find((r) => r.k === 4)!;
const probe = (id: string) => probeResult(drafter.manifest, id).value;

describe("chapter 13's numbers equal their sources", () => {
  test("the rounds are the library's seeded speculative decoding, for every k", () => {
    const target = transformerModel(full);
    const draft = transformerModel(drafter);
    const tokens = promptTokens(target.tokenizer, speculative.loop.inputs![0]!);
    for (const { k, rounds } of run.byK) {
      const direct = speculate(target, draft, tokens, {
        k,
        maxNewTokens: SPEC_RUN.maxNewTokens,
        temperature: SPEC_RUN.temperature,
        rng: seededRng(SPEC_RUN.seed),
      });
      const word = (id: number) => target.tokenizer.decode([id]);
      expect(rounds).toEqual(
        direct.rounds.map((r) => ({
          drafted: r.drafted.map(word),
          accepted: r.accepted,
          next: r.next === null ? null : word(r.next),
        })),
      );
    }
    expect(run.byK.map((r) => r.k)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("the chips: held-out α, and Leviathan's expected words at the slider's k", () => {
    const [alpha, perCheck] = speculative.stats;
    expect(resolveStat(alpha, drafter)).toBe(probe("draft-acceptance-heldout"));
    for (let k = 1; k <= 8; k++)
      expect(resolveStat(perCheck, drafter, k)).toBe(
        evalArith("specExpectedTokens", { alpha: probe("draft-acceptance-heldout"), k }),
      );
    expect(statSource(perCheck, drafter)).toContain("drafter-64");
    expect(validateChapter(speculative)).toEqual([]);
  });

  test("the speedup chip follows the slider's k, and at k = 4 it is the drafter probe's speedup", () => {
    const speedup = speculative.stats.find((s) => s.id === "speedup")!;
    // The recorded cost ratio is the shipped models' weight ratio.
    expect(probe("draft-cost")).toBeCloseTo(
      parameterCounts(drafter).total / parameterCounts(full).total,
      12,
    );
    expect(resolveStat(speedup, drafter, 4)).toBeCloseTo(probe("draft-speedup-heldout"), 12);
    const byK = [1, 2, 4, 8].map((k) => resolveStat(speedup, drafter, k));
    expect(new Set(byK).size).toBe(byK.length);
    expect(statSource(speedup, drafter)).toContain("k from the slider");
  });

  test("the loop's three rounds show a bonus, a mid-draft correction and an early rejection", () => {
    const [r1, r2, r3] = k4.rounds;
    expect(r1!.accepted).toBe(4);
    expect(r2!.accepted).toBeGreaterThan(0);
    expect(r2!.accepted).toBeLessThan(4);
    expect(r3!.accepted).toBeLessThan(r2!.accepted);
  });
});

describe("chapter 13's scene", () => {
  test("a round's tiles: drafting, then kept, discarded and the senior's word", () => {
    const round = k4.rounds[1]!;
    expect(roundView(round, 0.5).states).toEqual([
      "drafted",
      "drafted",
      "hidden",
      "hidden",
      "hidden",
    ]);
    const verdict = roundView(round, 1.25).states;
    expect(verdict.slice(0, round.accepted).every((s) => s === "accepted")).toBe(true);
    expect(verdict.slice(round.accepted, 4).every((s) => s === "rejected")).toBe(true);
    expect(verdict[4]).toBe("added");
  });

  test("a round whose kept guesses end the story shows no senior's word", () => {
    const ended = { drafted: [" the", " end", "<eos>"], accepted: 3, next: null };
    expect(roundView(ended, 1.25).states).toEqual(["accepted", "accepted", "accepted", "hidden"]);
    expect(storyAfter([ended], 1)).toBe(" the end<eos>");
  });

  test("each word is written on its tile's showing face, in that face's ink", () => {
    // Round 2's verdict: a rejection, then the senior's correction.
    const { scene } = frameAt(speculative, run, 8);
    const round = k4.rounds[1]!;
    for (let i = 0; i < round.drafted.length; i++) {
      const kept = i < round.accepted;
      expect(textOf(scene, `tile.${i}`)).toMatchObject({
        text: round.drafted[i]!.trim(),
        part: `draft.${i}.${kept ? "accepted" : "rejected"}`,
        style: kept ? "ink" : "muted",
      });
    }
    const added = textOf(scene, `tile.${round.drafted.length}`);
    expect(added.part).toBe(`draft.${round.drafted.length}.added`);
    expect(textOf(scene, "added").part).toBe(added.part);
    expect(textOf(scene, "senior").text).toContain(`kept ${round.accepted} of 4`);
  });

  test("the story is each round's kept guesses, then the senior's word", () => {
    expect(storyAfter(k4.rounds, 1)).toBe(k4.rounds[0]!.drafted.join("") + k4.rounds[0]!.next);
    const { scene } = frameAt(speculative, run, 10);
    expect(textOf(scene, "story").text).toContain(storyAfter(k4.rounds, 1));
  });

  test("the slider's k picks that run's rounds", () => {
    const { scene } = frameAt(speculative, run, 10, { slider: 2, sliderSet: true });
    const k2 = run.byK.find((r) => r.k === 2)!.rounds[0]!;
    // Each word is written on its tile, trimmed so it sits centred.
    expect(texts(scene).slice(0, 3)).toEqual([...k2.drafted, k2.next!].map((w) => w.trim()));
  });

  test("the point lands by 10 s and the last beat is the failure", () => {
    const beat = (id: string) => speculative.loop.beats.find((b) => b.id === id)!.t;
    expect(beat("verdict")).toBeLessThan(10);
    expect(speculative.loop.beats.at(-1)!.id).toBe("heavy");
  });
});
