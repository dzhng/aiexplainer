import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { ModelManifest, fetchModel, forward, transformerModel } from "../src/index.ts";

const modelsDir = new URL("../../../apps/explainer/public/models/", import.meta.url);
const fixturesDir = new URL("../../../training/fixtures/trained/", import.meta.url);

interface Fixture {
  prompts: { tokens: number[]; indices: number[]; logits: number[] }[];
}

async function shippedTransformers(): Promise<string[]> {
  const ids: string[] = [];
  for (const entry of await readdir(modelsDir, { withFileTypes: true })) {
    const file = Bun.file(new URL(`${entry.name}/manifest.json`, modelsDir));
    if (!entry.isDirectory() || !(await file.exists())) continue;
    if (ModelManifest.parse(await file.json()).kind === "transformer") ids.push(entry.name);
  }
  return ids.sort();
}

describe("every trained model matches torch on 20 validation prompts", async () => {
  for (const id of await shippedTransformers()) {
    test(id, async () => {
      const model = transformerModel(await fetchModel(new URL(`${id}/manifest.json`, modelsDir)));
      const fixture: Fixture = await Bun.file(new URL(`${id}.json`, fixturesDir)).json();
      expect(fixture.prompts.length).toBe(20);
      let worst = 0;
      for (const { tokens, indices, logits } of fixture.prompts) {
        const actual = forward(model, tokens).logits;
        indices.forEach((index, i) => {
          worst = Math.max(worst, Math.abs(actual[index]! - logits[i]!));
        });
      }
      expect(worst).toBeLessThan(1e-3);
    });
  }
});
