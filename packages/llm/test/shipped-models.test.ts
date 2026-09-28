import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { ModelId, ModelManifest } from "../src/index.ts";

const modelsDir = new URL("../../../apps/explainer/public/models/", import.meta.url);
/** Every model file of the ladder together, decimal megabytes. */
const LADDER_BYTE_BUDGET = 25e6;

async function shippedManifests(): Promise<{ dir: string; manifest: ModelManifest }[]> {
  const dirs = (await readdir(modelsDir, { withFileTypes: true })).filter((e) => e.isDirectory());
  const found = [];
  for (const { name } of dirs) {
    const file = Bun.file(new URL(`${name}/manifest.json`, modelsDir));
    if (await file.exists())
      found.push({ dir: name, manifest: ModelManifest.parse(await file.json()) });
  }
  return found;
}

test("every shipped model is a ModelId with a training record and measured evidence (D25)", async () => {
  for (const { dir, manifest } of await shippedManifests()) {
    expect(ModelId.safeParse(manifest.id).success).toBe(true);
    expect(manifest.id).toBe(dir as ModelId);
    expect(manifest.training).toBeDefined();
    expect(manifest.evidence.length).toBeGreaterThan(0);
  }
});

test("the whole ladder's model files fit the byte budget", async () => {
  let total = await Bun.file(new URL("tokenizer/tokenizer.json", modelsDir)).size;
  for (const { dir, manifest } of await shippedManifests()) {
    total += await Bun.file(new URL(`${dir}/${manifest.weightsFile}`, modelsDir)).size;
  }
  expect(total).toBeLessThanOrEqual(LADDER_BYTE_BUDGET);
});
