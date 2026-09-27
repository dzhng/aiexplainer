import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { ModelId, ModelManifest } from "../src/index.ts";

const modelsDir = new URL("../../../apps/explainer/public/models/", import.meta.url);

test("every shipped model is a ModelId with a training record and measured evidence (D25)", async () => {
  const dirs = (await readdir(modelsDir, { withFileTypes: true })).filter((e) => e.isDirectory());
  for (const { name } of dirs) {
    const file = Bun.file(new URL(`${name}/manifest.json`, modelsDir));
    if (!(await file.exists())) continue; // the tokenizer directory has no manifest
    const manifest = ModelManifest.parse(await file.json());
    expect(ModelId.safeParse(manifest.id).success).toBe(true);
    expect(manifest.id).toBe(name as ModelId);
    expect(manifest.training).toBeDefined();
    expect(manifest.evidence.length).toBeGreaterThan(0);
  }
});
