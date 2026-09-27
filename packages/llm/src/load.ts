// Validates a manifest against its weights file and exposes each tensor as a typed-array
// view into the weights buffer (no copies).
import { DTYPE_BYTES, type Dtype, ModelManifest, type TensorEntry } from "./manifest.ts";

interface TypedArrays {
  f16: Float16Array;
  f32: Float32Array;
  u32: Uint32Array;
}

export interface Tensor<D extends Dtype = Dtype> {
  name: string;
  dtype: D;
  shape: readonly number[];
  data: TypedArrays[D];
}

export interface LoadedModel {
  manifest: ModelManifest;
  tensors: ReadonlyMap<string, Tensor>;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadModel(manifest: unknown, weights: ArrayBuffer): Promise<LoadedModel> {
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
  if (parsed.tokenizer.kind === "words" && !tensors.has(parsed.tokenizer.vocabTensor)) {
    throw new Error(`${parsed.id}: vocab tensor "${parsed.tokenizer.vocabTensor}" is missing`);
  }
  return { manifest: parsed, tensors };
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
    const elementBytes = DTYPE_BYTES[entry.dtype];
    if (entry.byteLength !== elements * elementBytes) {
      throw new Error(`${where} has ${entry.byteLength} bytes for shape [${entry.shape}]`);
    }
    if (entry.byteOffset % elementBytes !== 0) {
      throw new Error(`${where} offset ${entry.byteOffset} is not ${elementBytes}-byte aligned`);
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
  const length = entry.byteLength / DTYPE_BYTES[entry.dtype];
  const base = { name: entry.name, shape: entry.shape };
  switch (entry.dtype) {
    case "f16":
      return { ...base, dtype: "f16", data: new Float16Array(weights, entry.byteOffset, length) };
    case "f32":
      return { ...base, dtype: "f32", data: new Float32Array(weights, entry.byteOffset, length) };
    case "u32":
      return { ...base, dtype: "u32", data: new Uint32Array(weights, entry.byteOffset, length) };
  }
}
