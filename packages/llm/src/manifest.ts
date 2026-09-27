// The model file format shared by `training/` and this package: a JSON manifest
// describing the tensors packed into one little-endian `weights.bin`. This schema is
// the single owner; `bun run schema` emits it as JSON Schema (src/json-schemas.ts)
// for the Python exporter.
import { z } from "zod";

export const FORMAT_VERSION = 1;

/** The models the explainer ships (apps/explainer/public/models/<id>). */
export const ModelId = z.enum(["counts", "embed", "attn", "rope"]);
export type ModelId = z.infer<typeof ModelId>;

/** Random-init parity fixtures (training/fixtures/parity/<name>); never shipped. */
export const FixtureId = z.string().regex(/^fixture-[a-z0-9-]+$/);

export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "lowercase hex sha256");
const Count = z.int().nonnegative();

/** Element types a tensor may hold, with their size in bytes. */
export const DTYPE_BYTES = { f16: 2, f32: 4, u32: 4 } as const;
export const Dtype = z.enum(["f16", "f32", "u32"]);
export type Dtype = z.infer<typeof Dtype>;

export const TensorEntry = z.strictObject({
  name: z.string().min(1),
  dtype: Dtype,
  /** Row-major (C order) dimensions. */
  shape: z.array(Count),
  /** Offset into the weights file, a multiple of the dtype's size. */
  byteOffset: Count,
  byteLength: Count,
});
export type TensorEntry = z.infer<typeof TensorEntry>;

export const TokenizerRef = z.discriminatedUnion("kind", [
  /**
   * Whole words; the vocabulary is a tensor of code points, one zero-padded row per word.
   * Text is split by lowercasing, applying `replace` (e.g. curly → straight apostrophes),
   * then taking every match of `pattern` (a regex source valid in both Python and JS).
   */
  z.strictObject({
    kind: z.literal("words"),
    vocabTensor: z.string().min(1),
    pattern: z.string().min(1),
    replace: z.array(z.tuple([z.string().min(1), z.string()])),
  }),
  /** The shared BPE tokenizer, pinned by the sha256 of its file. */
  z.strictObject({ kind: z.literal("bpe"), file: z.string().min(1), sha256: Sha256 }),
]);
export type TokenizerRef = z.infer<typeof TokenizerRef>;

export const TrainingRecord = z.strictObject({
  dataset: z.literal("TinyStoriesV2-GPT4"),
  license: z.literal("CDLA-Sharing-1.0"),
  seed: Count,
  /** Optimizer steps; 0 for models that are counted rather than trained. */
  steps: Count,
  tokensSeen: Count,
  valLoss: z.number().optional(),
  wallSeconds: z.number().nonnegative(),
  torch: z.string(),
  /** The commit the export ran from, suffixed `-dirty` for an unclean tree. */
  gitSha: z.string().regex(/^[0-9a-f]{40}(-dirty)?$/),
});
export type TrainingRecord = z.infer<typeof TrainingRecord>;

/** A measured probe (D25). `prompt` is empty for probes over a whole corpus split. */
export const ProbeResult = z.strictObject({
  probe: z.string().min(1),
  prompt: z.string(),
  metric: z.string().min(1),
  value: z.number(),
  threshold: z.number(),
  pass: z.boolean(),
});
export type ProbeResult = z.infer<typeof ProbeResult>;

/**
 * `scenarios.json` next to a trained model's manifest: the prompts its probes chose for
 * the chapter to show (O2), keyed by probe.
 */
export const ModelScenarios = z.record(z.string(), z.array(z.string().min(1)).min(1));
export type ModelScenarios = z.infer<typeof ModelScenarios>;

export const MlpArch = z.union([
  z.literal("none"),
  /** `w2(silu(w1 x) * w3 x)`. */
  z.strictObject({ kind: z.literal("swiglu"), hidden: z.int().positive() }),
  /** Each token goes to its `topK` highest-probability experts, weighted by their renormalised probabilities. */
  z.strictObject({
    kind: z.literal("moe"),
    experts: z.int().positive(),
    topK: z.int().positive(),
    hidden: z.int().positive(),
  }),
]);
export type MlpArch = z.infer<typeof MlpArch>;

/**
 * The flags that cover every transformer in the ladder. training/model.py implements
 * the same flags; see forward.ts for the exact computation and tensor names.
 */
export const TransformerArch = z.strictObject({
  dModel: z.int().positive(),
  nLayers: Count,
  nHeads: z.int().positive(),
  /** Key/value heads; query head `h` reads kv head `floor(h / (nHeads / nKvHeads))`. */
  nKvHeads: z.int().positive(),
  ctx: z.int().positive(),
  vocab: z.int().positive(),
  attention: z.enum(["none", "causal"]),
  /** RoPE rotates interleaved pairs `(2i, 2i + 1)` by `pos · ropeTheta^(-2i / headDim)`. */
  positions: z.enum(["none", "rope"]),
  ropeTheta: z.number().positive(),
  mlp: MlpArch,
  norm: z.enum(["none", "rmsnorm"]),
  /** RMSNorm: `x / sqrt(mean(x²) + normEps) · gain`. */
  normEps: z.number().positive(),
  residual: z.boolean(),
  /** The unembedding reuses `tok_emb` instead of a separate `lm_head`. */
  tiedEmbeddings: z.boolean(),
});
export type TransformerArch = z.infer<typeof TransformerArch>;

const ManifestBase = {
  formatVersion: z.literal(FORMAT_VERSION),
  id: z.union([ModelId, FixtureId]),
  weightsFile: z.string().min(1),
  weightsSha256: Sha256,
  tensors: z.array(TensorEntry).min(1),
  /** Absent only for random-init parity fixtures, which are never trained. */
  training: TrainingRecord.optional(),
  /** Measured probes (D25). Every shipped model has at least one; a test enforces it. */
  evidence: z.array(ProbeResult),
};

export const ModelManifest = z.discriminatedUnion("kind", [
  z.strictObject({
    ...ManifestBase,
    kind: z.literal("word-counts"),
    tokenizer: TokenizerRef.options[0],
  }),
  z.strictObject({
    ...ManifestBase,
    kind: z.literal("transformer"),
    /** The file path is relative to the manifest's directory. */
    tokenizer: TokenizerRef.options[1],
    arch: TransformerArch,
  }),
]);
export type ModelManifest = z.infer<typeof ModelManifest>;
