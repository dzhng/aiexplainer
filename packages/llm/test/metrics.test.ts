import { expect, test } from "bun:test";
import { loadModel, modelMetric, probeResult } from "../src/index.ts";

const dir = new URL("../../../apps/explainer/public/models/counts/", import.meta.url);

async function loadShipped() {
  const manifest = await Bun.file(new URL("manifest.json", dir)).json();
  const weights = await Bun.file(new URL("weights.bin", dir)).arrayBuffer();
  return loadModel(manifest, weights);
}

test("model metrics read the shipped counts model's own record and shapes", async () => {
  const model = await loadShipped();
  expect(modelMetric(model, "training.tokensSeen")).toBe(model.manifest.training.tokensSeen);
  expect(modelMetric(model, "vocabSize")).toBe(model.tensors.get("vocab")!.shape[0]!);
});

test("a probe value comes from the manifest evidence, and a missing probe throws", async () => {
  const { manifest } = await loadShipped();
  expect(probeResult(manifest, "top-successor").prompt).toBe("upon");
  expect(() => probeResult(manifest, "no-such-probe")).toThrow(
    'no evidence for probe "no-such-probe"',
  );
});
