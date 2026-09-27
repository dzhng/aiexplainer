// Validates a manifest against its weights (and, for BPE models, tokenizer) file and
// exposes each tensor as a typed-array view into the weights buffer (no copies).
import {
  DTYPE_ALIGNMENT,
  type Dtype,
  ModelManifest,
  type TensorEntry,
  tensorByteLength,
} from "./manifest.ts";
import { type Tokenizer, loadTokenizer } from "./tokenizer.ts";

interface TypedArrays {
  f16: Float16Array;
  f32: Float32Array;
  u32: Uint32Array;
  /** Raw q8_0 blocks; `dequantizeQ8_0` decodes them. */
  q8_0: Uint8Array;
}

/** A tensor view; with the default parameter, a union narrowed by `dtype`. */
export type Tensor<D extends Dtype = Dtype> = D extends Dtype
  ? { name: string; dtype: D; shape: readonly number[]; data: TypedArrays[D] }
  : never;

export interface LoadedModel {
  manifest: ModelManifest;
  tensors: ReadonlyMap<string, Tensor>;
  /** Set for models that use the shared BPE tokenizer. */
  tokenizer?: Tokenizer;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `tokenizerFile` is the bytes of the manifest's BPE tokenizer file, when it names one. */
export async function loadModel(
  manifest: unknown,
  weights: ArrayBuffer,
  tokenizerFile?: ArrayBuffer,
): Promise<LoadedModel> {
  const parsed = ModelManifest.parse(manifest);
  const actualSha = await sha256Hex(weights);
  if (actualSha !== parsed.weightsSha256) {
    throw new Error(
      `${parsed.id}: weights sha256 ${actualSha} does not match manifest ${parsed.weightsSha256}`,
    );
  }
  checkTensorLayout(parsed.id, parsed.tensors, weights.byteLength);

  const tensors = new Map<string, Tensor>();
  for (const entry of parsed.tensors) {
    tensors.set(entry.name, view(weights, entry));
  }
  const ref = parsed.tokenizer;
  if (ref.kind === "words") {
    if (!tensors.has(ref.vocabTensor)) {
      throw new Error(`${parsed.id}: vocab tensor "${ref.vocabTensor}" is missing`);
    }
    return { manifest: parsed, tensors };
  }
  if (!tokenizerFile) throw new Error(`${parsed.id}: needs its tokenizer file ${ref.file}`);
  const tokenizerSha = await sha256Hex(tokenizerFile);
  if (tokenizerSha !== ref.sha256) {
    throw new Error(`${parsed.id}: tokenizer sha256 ${tokenizerSha} does not match ${ref.sha256}`);
  }
  const tokenizer = loadTokenizer(JSON.parse(new TextDecoder().decode(tokenizerFile)));
  return { manifest: parsed, tensors, tokenizer };
}

/** Fetches a manifest, its weights and (for BPE models) its tokenizer, then loads them. */
export async function fetchModel(manifestUrl: URL): Promise<LoadedModel> {
  const bytes = async (url: URL) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.arrayBuffer();
  };
  const manifest = JSON.parse(new TextDecoder().decode(await bytes(manifestUrl)));
  const parsed = ModelManifest.parse(manifest);
  const [weights, tokenizerFile] = await Promise.all([
    bytes(new URL(parsed.weightsFile, manifestUrl)),
    parsed.tokenizer.kind === "bpe"
      ? bytes(new URL(parsed.tokenizer.file, manifestUrl))
      : undefined,
  ]);
  return loadModel(parsed, weights, tokenizerFile);
}

/** The named tensor, which must exist with the given dtype. */
export function tensor<D extends Dtype>(model: LoadedModel, name: string, dtype: D): Tensor<D> {
  const found = model.tensors.get(name);
  if (!found) throw new Error(`${model.manifest.id}: no tensor "${name}"`);
  if (found.dtype !== dtype) {
    throw new Error(`${model.manifest.id}: tensor "${name}" is ${found.dtype}, expected ${dtype}`);
  }
  return found as Tensor<D>;
}

function checkTensorLayout(id: string, entries: readonly TensorEntry[], fileBytes: number): void {
  const names = new Set<string>();
  for (const entry of entries) {
    const where = `${id}: tensor "${entry.name}"`;
    if (names.has(entry.name)) throw new Error(`${where} is listed twice`);
    names.add(entry.name);
    const elements = entry.shape.reduce((product, dim) => product * dim, 1);
    if (entry.byteLength !== tensorByteLength(entry.dtype, elements)) {
      throw new Error(`${where} has ${entry.byteLength} bytes for ${entry.dtype} [${entry.shape}]`);
    }
    const alignment = DTYPE_ALIGNMENT[entry.dtype];
    if (entry.byteOffset % alignment !== 0) {
      throw new Error(`${where} offset ${entry.byteOffset} is not ${alignment}-byte aligned`);
    }
    if (entry.byteOffset + entry.byteLength > fileBytes) {
      throw new Error(`${where} ends past the ${fileBytes}-byte weights file`);
    }
  }
  const byOffset = [...entries].sort((a, b) => a.byteOffset - b.byteOffset);
  for (let i = 1; i < byOffset.length; i++) {
    const previous = byOffset[i - 1]!;
    const current = byOffset[i]!;
    if (previous.byteOffset + previous.byteLength > current.byteOffset) {
      throw new Error(`${id}: tensors "${previous.name}" and "${current.name}" overlap`);
    }
  }
}

function view(weights: ArrayBuffer, entry: TensorEntry): Tensor {
  const { byteOffset, byteLength } = entry;
  const base = { name: entry.name, shape: entry.shape };
  switch (entry.dtype) {
    case "f16":
      return { ...base, dtype: "f16", data: new Float16Array(weights, byteOffset, byteLength / 2) };
    case "f32":
      return { ...base, dtype: "f32", data: new Float32Array(weights, byteOffset, byteLength / 4) };
    case "u32":
      return { ...base, dtype: "u32", data: new Uint32Array(weights, byteOffset, byteLength / 4) };
    case "q8_0":
      return { ...base, dtype: "q8_0", data: new Uint8Array(weights, byteOffset, byteLength) };
  }
}
