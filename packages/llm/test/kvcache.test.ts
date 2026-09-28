import { expect, test } from "bun:test";
import {
  cacheBytesPerToken,
  createKvCache,
  fetchModel,
  forward,
  generate,
  kvBytes,
  kvHeld,
  resetKvCache,
  seededRng,
  transformerModel,
} from "../src/index.ts";

const model = transformerModel(
  await fetchModel(
    new URL("../../../apps/explainer/public/models/full/manifest.json", import.meta.url),
  ),
);
const text = [
  0,
  ...model.tokenizer.encode("Once upon a time, there was a little girl named Lily."),
];

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  return worst;
};

test("cached and uncached logits are equal, token by token", () => {
  const kv = createKvCache(model);
  for (let i = 0; i < text.length; i++) {
    const cached = forward(model, [text[i]!], { kv }).logits;
    const full = forward(model, text.slice(0, i + 1)).logits;
    expect(maxDiff(cached, full)).toBeLessThan(1e-4);
  }
  expect(kv.length).toBe(text.length);
  expect(kvBytes(kv, model)).toBe(text.length * cacheBytesPerToken(model));
  resetKvCache(kv);
  expect(kvHeld(kv)).toBe(0);
});

test("a ring cache of the window's size equals a windowed reference, not the full context", () => {
  const window = 5;
  const kv = createKvCache(model, window);
  // The whole text through the ring at once (fed in pieces), then one more token.
  const ring = forward(model, text.slice(0, -1), { kv, window }).logits;
  const reference = forward(model, text.slice(0, -1), { window }).logits;
  expect(maxDiff(ring, reference)).toBeLessThan(1e-4);
  const next = forward(model, [text.at(-1)!], { kv, window }).logits;
  const nextReference = forward(model, text, { window }).logits;
  expect(maxDiff(next, nextReference)).toBeLessThan(1e-4);
  expect(maxDiff(next, forward(model, text).logits)).toBeGreaterThan(1e-3);
  // The ring holds only the window's worth of notes.
  expect(kvHeld(kv)).toBe(window);
  expect(kvBytes(kv, model)).toBe(window * cacheBytesPerToken(model));
});

test("windowed generation matches a windowed reread; the window changes the words", () => {
  const prompt = text.slice(0, 10);
  const opts = { maxNewTokens: 6, temperature: 0.8 };
  const ring = [...generate(model, prompt, { ...opts, rng: seededRng(3), window: 6 })];
  const reread = [
    ...generate(model, prompt, { ...opts, rng: seededRng(3), window: 6, cache: false }),
  ];
  expect(ring.map((s) => s.token)).toEqual(reread.map((s) => s.token));
  const unwindowed = [...generate(model, prompt, { ...opts, rng: seededRng(3) })];
  expect(ring.map((s) => s.token)).not.toEqual(unwindowed.map((s) => s.token));
});

test("a cache smaller than the context needs a window that fits it", () => {
  expect(() => forward(model, [1], { kv: createKvCache(model, 4) })).toThrow();
  expect(() => createKvCache(model, 0)).toThrow();
});

test("the bytes per token follow the arch: 2 × layers × KV heads × head size × 4", () => {
  const { nLayers, nKvHeads } = model.arch;
  expect(cacheBytesPerToken(model)).toBe(2 * nLayers * nKvHeads * model.headDim * 4);
});
