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
  kvBytesPerToken: {
    describe:
      "bytes of notes (keys and values) kept per token: 2 × layers × KV heads × head size × 4 (f32)",
    read: (model) => {
      const arch = transformerArch(model);
      return 2 * arch.nLayers * arch.nKvHeads * (arch.dModel / arch.nHeads) * 4;
    },
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
  "params.total": {
    describe: "weights stored in the model file, counted tensor by tensor",
    read: (model) => parameterCounts(model).total,
  },
  "params.perToken": {
    describe:
      "weights one token's forward pass uses: all of them, less the experts the router skips",
    read: (model) => parameterCounts(model).perToken,
  },
} satisfies Record<string, ModelMetricEntry>;

/**
 * A transformer's parameter count, and how many one token uses: in a mixture of experts each
 * token runs only `topK` of the `experts` in every layer, so the others' weights sit idle.
 */
export function parameterCounts(model: ModelSource): { total: number; perToken: number } {
  const arch = transformerArch(model);
  if (!("manifest" in model)) throw new Error("parameter counts need a model file");
  const total = model.manifest.tensors.reduce(
    (sum, t) => sum + t.shape.reduce((a, b) => a * b, 1),
    0,
  );
  if (arch.mlp === "none" || arch.mlp.kind !== "moe") return { total, perToken: total };
  const perExpert = 3 * arch.dModel * arch.mlp.hidden;
  const idle = arch.nLayers * (arch.mlp.experts - arch.mlp.topK) * perExpert;
  return { total, perToken: total - idle };
}

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
