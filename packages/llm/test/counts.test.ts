import { describe, expect, test } from "bun:test";
import { countsModel, loadModel, nextWords, type NextWord } from "../src/index.ts";

const training = new URL("../../../training/fixtures/", import.meta.url);
const app = new URL("../../../apps/explainer/public/models/counts/", import.meta.url);

async function loadCounts(dir: URL) {
  const manifest = await Bun.file(new URL("manifest.json", dir)).json();
  const weights = await Bun.file(new URL("weights.bin", dir)).arrayBuffer();
  return countsModel(await loadModel(manifest, weights));
}

interface GoldenCase {
  word: string;
  k: number;
  next: NextWord[];
}

describe("nextWords", () => {
  test("matches the Python reference on the fixture export exactly", async () => {
    const model = await loadCounts(new URL("counts/", training));
    const golden: GoldenCase[] = await Bun.file(new URL("counts.golden.json", training)).json();
    expect(golden.length).toBe(model.vocab.length + 2);
    for (const { word, k, next } of golden) {
      expect({ word, next: nextWords(model, word, k) }).toEqual({ word, next });
    }
  });

  test("returns [] for a word the model never kept", async () => {
    const model = await loadCounts(new URL("counts/", training));
    expect(nextWords(model, "zebra", 5)).toEqual([]);
  });

  test("probabilities sum to 1 for every word of the shipped model", async () => {
    const model = await loadCounts(app);
    for (const word of model.vocab) {
      const next = nextWords(model, word, model.successorsPerWord);
      if (next.length === 0) continue;
      const total = next.reduce((sum, { p }) => sum + p, 0);
      expect(Math.abs(total - 1)).toBeLessThan(1e-6);
    }
  });
});
