import { describe, expect, test } from "bun:test";
import {
  createKvCache,
  fetchModel,
  forward,
  probabilities,
  seededRng,
  speculate,
  transformerModel,
  type Transformer,
} from "../src/index.ts";

const parity = new URL("../../../training/fixtures/parity/", import.meta.url);
const load = async (name: string) =>
  transformerModel(await fetchModel(new URL(`${name}/manifest.json`, parity)));
const target = await load("gqa");
const drafter = await load("rope");
const prompt = [0, 431, 440, 260, 399, 13];

function greedy(model: Transformer, tokens: number[], n: number): number[] {
  const kv = createKvCache(model);
  const out = [...tokens];
  let logits = forward(model, out, { kv }).logits;
  for (let i = 0; i < n; i++) {
    const p = probabilities(logits, 0);
    const next = p.indexOf(1);
    out.push(next);
    logits = forward(model, [next], { kv }).logits;
  }
  return out;
}

describe("speculative decoding", () => {
  test("at temperature 0 it produces exactly the target's greedy tokens", () => {
    const result = speculate(target, drafter, prompt, {
      k: 4,
      maxNewTokens: 20,
      temperature: 0,
      rng: seededRng(1),
    });
    expect(result.tokens).toEqual(greedy(target, prompt, 20));
    const generated = result.rounds.reduce((n, r) => n + r.accepted + 1, 0);
    expect(generated).toBe(20);
  });

  test("a drafter identical to the target has every guess accepted", () => {
    const result = speculate(target, target, prompt, {
      k: 4,
      maxNewTokens: 15,
      temperature: 1,
      rng: seededRng(2),
    });
    for (const round of result.rounds) expect(round.accepted).toBe(round.drafted.length);
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
