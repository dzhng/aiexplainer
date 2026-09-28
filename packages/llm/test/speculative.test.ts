import { describe, expect, test } from "bun:test";
import {
  fetchModel,
  forward,
  generate,
  seededRng,
  speculate,
  speculativeState,
  speculativeStep,
  transformerModel,
  verifyDrafts,
} from "../src/index.ts";

const parity = new URL("../../../training/fixtures/parity/", import.meta.url);
const load = async (name: string) =>
  transformerModel(await fetchModel(new URL(`${name}/manifest.json`, parity)));
const target = await load("gqa");
const drafter = await load("rope");
const prompt = [0, 431, 440, 260, 399, 13];

/** Pearson's χ² of `counts` against `n · expected`. */
function chiSquare(counts: number[], expected: number[], n: number): number {
  return counts.reduce((sum, c, i) => sum + (c - n * expected[i]!) ** 2 / (n * expected[i]!), 0);
}
/** χ² critical values at p = 0.001, by degrees of freedom. */
const CRITICAL = { 4: 18.47, 24: 51.18 } as const;

describe("the acceptance rule keeps the target's distribution (Leviathan et al. 2023, §2.3)", () => {
  // A fixture vocabulary of 5 tokens: the target p and a deliberately different drafter q.
  const p = [0.4, 0.25, 0.2, 0.1, 0.05];
  const q = [0.1, 0.3, 0.1, 0.3, 0.2];
  const draw = (probs: number[], r: number) => {
    let c = 0;
    for (let i = 0; i < probs.length; i++) if (r < (c += probs[i]!)) return i;
    return probs.length - 1;
  };

  test("χ² over 10k seeded samples: the first token is distributed as p, not q", () => {
    const rng = seededRng(7);
    const n = 10_000;
    const counts = [0, 0, 0, 0, 0];
    for (let s = 0; s < n; s++) {
      const guess = draw(q, rng());
      const { accepted, next } = verifyDrafts([p, p], [q], [guess], rng);
      counts[accepted === 1 ? guess : next]! += 1;
    }
    expect(chiSquare(counts, p, n)).toBeLessThan(CRITICAL[4]);
    // The drafter's own distribution fails the same test, so the test has teeth.
    expect(chiSquare(counts, q, n)).toBeGreaterThan(CRITICAL[4] * 10);
  });

  test("χ² over 10k seeded samples: two drafted tokens keep the joint distribution p × p", () => {
    const rng = seededRng(11);
    const n = 10_000;
    const counts = Array<number>(25).fill(0);
    for (let s = 0; s < n; s++) {
      const drafted = [draw(q, rng()), draw(q, rng())];
      const { accepted, next } = verifyDrafts([p, p, p], [q, q], drafted, rng);
      // The first two committed tokens; when the round ends early, the second comes from p.
      const out = [...drafted.slice(0, accepted), next];
      if (out.length < 2) out.push(draw(p, rng()));
      counts[out[0]! * 5 + out[1]!]! += 1;
    }
    const joint = p.flatMap((a) => p.map((b) => a * b));
    expect(chiSquare(counts, joint, n)).toBeLessThan(CRITICAL[24]);
  });

  test("forced branches: all accepted plus a bonus, a first reject, and a reject mid-way", () => {
    const one = [0, 1, 0, 0, 0];
    const two = [0, 0, 1, 0, 0];
    // The drafter proposed exactly what the target would: every guess is kept, then a bonus.
    expect(verifyDrafts([one, one, two], [one, one], [1, 1], seededRng(1))).toEqual({
      accepted: 2,
      next: 2,
    });
    // The target gives the first guess no mass: rejected, replaced from p − q.
    expect(verifyDrafts([two, one], [one], [1], seededRng(1))).toEqual({ accepted: 0, next: 2 });
    // Kept once, then rejected: the correction comes from the target's second row.
    expect(verifyDrafts([one, two, one], [one, one], [1, 1], seededRng(1))).toEqual({
      accepted: 1,
      next: 2,
    });
  });
});

describe("speculative decoding on real models", () => {
  test("at temperature 0 it produces exactly the target's greedy tokens", () => {
    const result = speculate(target, drafter, prompt, {
      k: 4,
      maxNewTokens: 20,
      temperature: 0,
      rng: seededRng(1),
    });
    const greedy = generate(target, prompt, {
      maxNewTokens: 20,
      temperature: 0,
      rng: seededRng(0),
    });
    expect(result.tokens).toEqual([...prompt, ...[...greedy].map((s) => s.token)]);
    const generated = result.rounds.reduce((n, r) => n + r.accepted + 1, 0);
    expect(generated).toBe(20);
  });

  test("a drafter identical to the target has every guess accepted, plus a bonus each round", () => {
    const result = speculate(target, target, prompt, {
      k: 4,
      maxNewTokens: 15,
      temperature: 1,
      rng: seededRng(2),
    });
    for (const round of result.rounds) expect(round.accepted).toBe(round.drafted.length);
  });

  test("after a rejection both caches roll back to the committed prefix, and stay correct", () => {
    const state = speculativeState(target, drafter, prompt);
    let rejected = false;
    for (let i = 0; i < 6; i++) {
      const round = speculativeStep(target, drafter, state, {
        k: 4,
        temperature: 1,
        rng: seededRng(30 + i),
      });
      rejected ||= round.accepted < round.drafted.length;
      expect(state.targetKv.length).toBe(state.tokens.length - 1);
      expect(state.draftKv.length).toBeLessThanOrEqual(state.tokens.length - 1);
    }
    expect(rejected).toBe(true);
    // Continuing from the rolled-back cache gives the same logits as a fresh pass.
    const cached = forward(target, [state.tokens.at(-1)!], { kv: state.targetKv }).logits;
    const fresh = forward(target, state.tokens).logits;
    expect(Math.max(...cached.map((v, i) => Math.abs(v - fresh[i]!)))).toBeLessThan(1e-4);
  });

  test("allPositions returns logits after every token, the last matching a plain forward", () => {
    const all = forward(target, prompt, { allPositions: true }).logits;
    const vocab = target.arch.vocab;
    expect(all.length).toBe(prompt.length * vocab);
    const last = forward(target, prompt).logits;
    expect(Array.from(all.subarray(all.length - vocab))).toEqual(Array.from(last));
    const second = forward(target, prompt.slice(0, 2)).logits;
    const secondRow = all.subarray(vocab, 2 * vocab);
    expect(Math.max(...secondRow.map((v, i) => Math.abs(v - second[i]!)))).toBeLessThan(1e-5);
  });
});

describe("speculative decoding stops where generation stops", () => {
  /** The target with `eos` swapped for `token`, so a known greedy token ends the text. */
  const endingAt = (token: number) => ({
    ...target,
    tokenizer: { ...target.tokenizer, special: { ...target.tokenizer.special, eos: token } },
  });
  const greedy = (model: typeof target, from: number[], n: number) =>
    [...generate(model, from, { maxNewTokens: n, temperature: 0, rng: seededRng(0) })].map(
      (s) => s.token,
    );

  test("an accepted <eos> in the draft ends the text: no later guesses, no bonus", () => {
    const [first] = greedy(target, prompt, 1);
    const model = endingAt(first!);
    const result = speculate(model, model, prompt, {
      k: 4,
      maxNewTokens: 10,
      temperature: 0,
      rng: seededRng(1),
    });
    expect(result.tokens).toEqual([...prompt, first!]);
    expect(result.rounds).toEqual([{ drafted: [first!], accepted: 1, next: null }]);
  });

  test("an <eos> accepted mid-draft keeps the tokens before it, as generate does", () => {
    const [, , third] = greedy(target, prompt, 3);
    const model = endingAt(third!);
    const state = speculativeState(model, model, prompt);
    const round = speculativeStep(model, model, state, { k: 4, temperature: 0, rng: seededRng(1) });
    expect(state.tokens).toEqual([...prompt, ...greedy(model, prompt, 10)]);
    expect(round).toEqual({ drafted: state.tokens.slice(prompt.length), accepted: 3, next: null });
    // Both caches still hold every committed token but the last.
    expect(state.targetKv.length).toBe(state.tokens.length - 1);
    expect(state.draftKv.length).toBeLessThanOrEqual(state.tokens.length - 1);
  });

  test("it never writes past the context: a full prompt gets nothing, one short gets one", () => {
    const { ctx } = target.arch;
    const full = Array.from({ length: ctx }, (_, i) => prompt[i % prompt.length]!);
    const options = { k: 4, maxNewTokens: 8, temperature: 1, rng: seededRng(3) };
    expect(speculate(target, drafter, full, options).tokens).toEqual(full);
    const short = full.slice(0, ctx - 1);
    expect(speculate(target, drafter, short, options).tokens).toHaveLength(ctx);
    expect(() =>
      speculativeStep(target, drafter, speculativeState(target, drafter, full), options),
    ).toThrow(RangeError);
  });
});
