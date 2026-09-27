// The model file format shared by `training/` and this package: a JSON manifest
// describing the tensors packed into one little-endian `weights.bin`. This schema is
// the single owner; `bun run schema` emits it as JSON Schema for the Python exporter.
import { z } from "zod";

export const FORMAT_VERSION = 1;

export const ModelId = z.enum(["counts"]);
export type ModelId = z.infer<typeof ModelId>;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "lowercase hex sha256");
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
  /** Whole words; the vocabulary is a tensor of code points, one zero-padded row per word. */
  z.strictObject({ kind: z.literal("words"), vocabTensor: z.string().min(1) }),
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

export const ModelManifest = z.strictObject({
  formatVersion: z.literal(FORMAT_VERSION),
  id: ModelId,
  kind: z.enum(["word-counts", "transformer"]),
  tokenizer: TokenizerRef,
  weightsFile: z.string().min(1),
  weightsSha256: Sha256,
  tensors: z.array(TensorEntry).min(1),
  training: TrainingRecord,
  /** Every model ships with at least one measured probe (D25). */
  evidence: z.array(ProbeResult).min(1),
});
export type ModelManifest = z.infer<typeof ModelManifest>;

/** Where `bun run schema` writes the JSON Schema, relative to this package. */
export const MANIFEST_SCHEMA_FILE = "schema/manifest.schema.json";

export function manifestJsonSchemaText(): string {
  return `${JSON.stringify(z.toJSONSchema(ModelManifest), null, 2)}\n`;
}
