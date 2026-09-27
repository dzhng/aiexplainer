// What a stat chip may read off a loaded model (`StatChip.value.kind: 'model' | 'probe'`).
// A chapter names a metric or a probe; the number itself always comes from the model files.
import type { LoadedModel } from "./load.ts";
import type { ModelManifest, ProbeResult } from "./manifest.ts";

export interface ModelMetricEntry {
  /** Where the number comes from, in plain words (shown in the help panel). */
  describe: string;
  read(model: LoadedModel): number;
}

export const MODEL_METRICS = {
  "training.tokensSeen": {
    describe: "words or tokens of TinyStories the model read while it was built",
    read: (model) => trainingRecord(model).tokensSeen,
  },
  vocabSize: {
    describe: "entries in the model's vocabulary",
    read: vocabSize,
  },
  mlpNeurons: {
    describe: "MLP neurons in each block, from the model's shape",
    read: (model) => {
      const { manifest } = model;
      if (manifest.kind !== "transformer" || manifest.arch.mlp === "none")
        throw new Error(`${manifest.id} has no MLP`);
      return manifest.arch.mlp.hidden;
    },
  },
} satisfies Record<string, ModelMetricEntry>;

export type ModelMetric = keyof typeof MODEL_METRICS;

export function isModelMetric(name: string): name is ModelMetric {
  return Object.hasOwn(MODEL_METRICS, name);
}

export function modelMetric(model: LoadedModel, metric: ModelMetric): number {
  return MODEL_METRICS[metric].read(model);
}

/** The measured probe named `probe` in the manifest's evidence; throws if the model has none. */
export function probeResult(manifest: ModelManifest, probe: string): ProbeResult {
  const found = manifest.evidence.find((e) => e.probe === probe);
  if (!found) throw new Error(`${manifest.id}: no evidence for probe "${probe}"`);
  return found;
}

function vocabSize(model: LoadedModel): number {
  const ref = model.manifest.tokenizer;
  if (ref.kind === "bpe") {
    if (!model.tokenizer) throw new Error(`${model.manifest.id}: tokenizer not loaded`);
    return model.tokenizer.vocabSize;
  }
  const vocab = model.tensors.get(ref.vocabTensor);
  if (!vocab?.shape[0]) throw new Error(`${model.manifest.id}: vocab tensor has no rows`);
  return vocab.shape[0];
}

/** Shipped models always carry a training record; only test fixtures omit it. */
function trainingRecord(model: LoadedModel): NonNullable<ModelManifest["training"]> {
  const record = model.manifest.training;
  if (!record) throw new Error(`model "${model.manifest.id}" has no training record`);
  return record;
}
