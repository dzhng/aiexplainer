// What a stat chip may read off a loaded model (`StatChip.value.kind: 'model' | 'probe'`).
// A chapter names a metric or a probe; the number itself always comes from the model files.
import { sourceId, type LoadedModel, type ModelSource } from "./load.ts";
import type { ModelManifest, ProbeResult } from "./manifest.ts";

export interface ModelMetricEntry {
  /** Where the number comes from, in plain words (shown in the help panel). */
  describe: string;
  read(model: ModelSource): number;
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
  dModel: {
    describe: "numbers in each token's embedding: the directions its arrow can point in",
    read: (model) => {
      if (!("manifest" in model) || model.manifest.kind !== "transformer")
        throw new Error("dModel needs a transformer");
      return model.manifest.arch.dModel;
    },
  },
  context: {
    describe: "the longest text the model reads at once, in tokens, from its shape",
    read: (model) => transformerArch(model).ctx,
  },
  heads: {
    describe: "attention heads (readers) in each block, from the model's shape",
    read: (model) => transformerArch(model).nHeads,
  },
  kvHeads: {
    describe: "sets of keys and values (notes) each block keeps, shared by its heads",
    read: (model) => transformerArch(model).nKvHeads,
  },
  mlpNeurons: {
    describe: "MLP neurons in each block, from the model's shape",
    read: (model) => {
      const manifest = "manifest" in model ? model.manifest : null;
      if (manifest?.kind !== "transformer" || manifest.arch.mlp === "none")
        throw new Error(`${sourceId(model)} has no MLP`);
      return manifest.arch.mlp.hidden;
    },
  },
} satisfies Record<string, ModelMetricEntry>;

export type ModelMetric = keyof typeof MODEL_METRICS;

export function isModelMetric(name: string): name is ModelMetric {
  return Object.hasOwn(MODEL_METRICS, name);
}

export function modelMetric(model: ModelSource, metric: ModelMetric): number {
  return MODEL_METRICS[metric].read(model);
}

/** The measured probe named `probe` in a model's evidence; throws if it has none. */
export function probeResult(
  source: Pick<ModelManifest, "id" | "evidence">,
  probe: string,
): ProbeResult {
  const found = source.evidence.find((e) => e.probe === probe);
  if (!found) throw new Error(`${source.id}: no evidence for probe "${probe}"`);
  return found;
}

function vocabSize(model: ModelSource): number {
  if (!("manifest" in model)) return model.tokenizer.vocabSize;
  const ref = model.manifest.tokenizer;
  if (ref.kind === "bpe") {
    if (!model.tokenizer) throw new Error(`${model.manifest.id}: tokenizer not loaded`);
    return model.tokenizer.vocabSize;
  }
  const vocab = model.tensors.get(ref.vocabTensor);
  if (!vocab?.shape[0]) throw new Error(`${model.manifest.id}: vocab tensor has no rows`);
  return vocab.shape[0];
}

function transformerArch(model: ModelSource) {
  const manifest = "manifest" in model ? model.manifest : null;
  if (manifest?.kind !== "transformer") throw new Error(`${sourceId(model)} is not a transformer`);
  return manifest.arch;
}

/** Shipped models always carry a training record; test fixtures and the tokenizer lack one. */
function trainingRecord(model: ModelSource): NonNullable<LoadedModel["manifest"]["training"]> {
  if ("manifest" in model && model.manifest.training) return model.manifest.training;
  const id = "manifest" in model ? model.manifest.id : model.id;
  throw new Error(`model "${id}" has no training record`);
}
