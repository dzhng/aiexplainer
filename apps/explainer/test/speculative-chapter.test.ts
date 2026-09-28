import { describe, expect, test } from "bun:test";
import {
  evalArith,
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
import { frameAt } from "./scene-harness.ts";

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
          next: word(r.next),
        })),
      );
    }
    expect(run.byK.map((r) => r.k)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("the chips: held-out α and speedup probes, and Leviathan's expected words at the slider's k", () => {
    const [alpha, perCheck, speedup] = speculative.stats;
    expect(resolveStat(alpha, drafter)).toBe(probe("draft-acceptance-heldout"));
    expect(resolveStat(speedup, drafter)).toBe(probe("draft-speedup-heldout"));
    for (let k = 1; k <= 8; k++)
      expect(resolveStat(perCheck, drafter, k)).toBe(
        evalArith("specExpectedTokens", { alpha: probe("draft-acceptance-heldout"), k }),
      );
    expect(statSource(perCheck, drafter)).toContain("drafter-64");
    expect(validateChapter(speculative)).toEqual([]);
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

  test("the story is each round's kept guesses, then the senior's word", () => {
    expect(storyAfter(k4.rounds, 1)).toBe(k4.rounds[0]!.drafted.join("") + k4.rounds[0]!.next);
    const { frame } = frameAt(speculative, run, 10);
    expect(frame.tags.text.find((t) => t.includes(storyAfter(k4.rounds, 1)))).toBeDefined();
  });

  test("the slider's k picks that run's rounds", () => {
    const { frame } = frameAt(speculative, run, 10, { slider: 2, sliderSet: true });
    const k2 = run.byK.find((r) => r.k === 2)!.rounds[0]!;
    expect(frame.tags.text.slice(0, 3)).toEqual([...k2.drafted, k2.next]);
  });

  test("the point lands by 10 s and the last beat is the failure", () => {
    const beat = (id: string) => speculative.loop.beats.find((b) => b.id === id)!.t;
    expect(beat("verdict")).toBeLessThan(10);
    expect(speculative.loop.beats.at(-1)!.id).toBe("heavy");
  });
});
