import { expect, test } from "bun:test";
import {
  fetchModel,
  forward,
  generate,
  probabilities,
  seededRng,
  transformerModel,
  type GenerateOptions,
} from "../src/index.ts";

const model = transformerModel(
  await fetchModel(
    new URL("../../../apps/explainer/public/models/full/manifest.json", import.meta.url),
  ),
);
const prompt = [0, ...model.tokenizer.encode("Once upon a time")];
const run = (options: Partial<GenerateOptions> = {}) => [
  ...generate(model, prompt, { maxNewTokens: 12, temperature: 0.8, rng: seededRng(7), ...options }),
];

test("the same seed writes the same text; another seed writes different text", () => {
  const a = run().map((s) => s.token);
  expect(run().map((s) => s.token)).toEqual(a);
  expect(run({ rng: seededRng(8) }).map((s) => s.token)).not.toEqual(a);
});

test("rereading everything and reusing a cache write the same tokens; only the work differs", () => {
  const cached = run();
  const reread = run({ cache: false });
  expect(reread.map((s) => s.token)).toEqual(cached.map((s) => s.token));
  // Without a cache, step i rereads the prompt and every token written before it.
  expect(reread.map((s) => s.fed)).toEqual(reread.map((_, i) => prompt.length + i));
  expect(cached.map((s) => s.fed)).toEqual(cached.map((_, i) => (i === 0 ? prompt.length : 1)));
});

test("greedy steps take the model's top token after the text so far", () => {
  const steps = run({ temperature: 0, maxNewTokens: 5 });
  const text = [...prompt];
  for (const step of steps) {
    const probs = probabilities(forward(model, text).logits, 1);
    expect(step.token).toBe(probs.indexOf(Math.max(...probs)));
    text.push(step.token);
  }
});

test("it stops at the context limit and right after <eos>", () => {
  const long = Array.from({ length: model.arch.ctx - 3 }, (_, i) => prompt[i % prompt.length]!);
  expect([
    ...generate(model, long, { maxNewTokens: 50, temperature: 0.8, rng: seededRng(1) }),
  ]).toHaveLength(3);
  // Every word equally likely (an all-zero unembedding) and a draw that lands on <eos>.
  const eos = model.tokenizer.special.eos;
  const V = model.arch.vocab;
  const flat = { ...model, lmHead: new Float32Array(model.lmHead.length) };
  const steps = [
    ...generate(flat, prompt, { maxNewTokens: 5, temperature: 1, rng: () => (eos + 0.5) / V }),
  ];
  expect(steps.map((s) => s.token)).toEqual([eos]);
});
