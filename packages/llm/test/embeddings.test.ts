import { expect, test } from "bun:test";
import { fetchModel, nearestTokens, transformerModel } from "../src/index.ts";

test("nearestTokens ranks other tokens by cosine similarity of their embeddings", async () => {
  const manifest = new URL("../../../training/fixtures/parity/gqa/manifest.json", import.meta.url);
  const model = transformerModel(await fetchModel(manifest));
  const d = model.arch.dModel;
  const row = (t: number) => model.tokEmb.subarray(t * d, (t + 1) * d);
  const cosine = (a: Float32Array, b: Float32Array) => {
    const dot = a.reduce((s, x, i) => s + x * b[i]!, 0);
    return dot / Math.hypot(...a) / Math.hypot(...b);
  };
  const neighbours = nearestTokens(model, 431, 5);
  expect(neighbours).toHaveLength(5);
  expect(neighbours.map((n) => n.token)).not.toContain(431);
  for (let i = 1; i < 5; i++) {
    expect(neighbours[i - 1]!.similarity).toBeGreaterThanOrEqual(neighbours[i]!.similarity);
  }
  expect(neighbours[0]!.similarity).toBeCloseTo(cosine(row(431), row(neighbours[0]!.token)), 5);
  const best = Math.max(
    ...Array.from({ length: model.arch.vocab }, (_, t) =>
      t === 431 ? -1 : cosine(row(431), row(t)),
    ),
  );
  expect(neighbours[0]!.similarity).toBeCloseTo(best, 5);
});
