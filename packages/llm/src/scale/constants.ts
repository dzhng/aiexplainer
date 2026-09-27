/**
 * The cited production constants, read from `data/*.json` (each value carries its source
 * there). Swapping the reference GPU or model is a data-file swap.
 */
import h100 from "./data/h100-sxm.json";
import llama from "./data/llama-3-8b.json";
import {
  bytes,
  bytesPerSec,
  flopsPerSec,
  type Bytes,
  type BytesPerSec,
  type FlopsPerSec,
} from "./units.ts";

export interface ModelConfig {
  name: string;
  source: string;
  nLayers: number;
  nHeads: number;
  nKvHeads: number;
  hidden: number;
  intermediate: number;
  vocab: number;
  ropeTheta: number;
  maxPos: number;
  tiedEmbeddings: boolean;
  headDim: number;
  /** Stored as computed by `paramsFromShapes()`; a test keeps them equal. */
  params: number;
}

export interface Gpu {
  name: string;
  source: string;
  bandwidth: BytesPerSec;
  /** Dense BF16 tensor throughput. */
  flopsDense: FlopsPerSec;
  /** The spec-sheet headline, which assumes 2:4 structured sparsity. Never used for dense math. */
  flopsSparse: FlopsPerSec;
  memory: Bytes;
}

const c = llama.fromConfig;
export const LLAMA_3_8B: ModelConfig = {
  name: llama.name,
  source: llama.source,
  nLayers: c.nLayers.value,
  nHeads: c.nHeads.value,
  nKvHeads: c.nKvHeads.value,
  hidden: c.hidden.value,
  intermediate: c.intermediate.value,
  vocab: c.vocab.value,
  ropeTheta: c.ropeTheta.value,
  maxPos: c.maxPos.value,
  tiedEmbeddings: c.tiedEmbeddings.value,
  headDim: llama.derived.headDim.value,
  params: llama.derived.params.value,
};

export const H100_SXM: Gpu = {
  name: h100.name,
  source: h100.source,
  bandwidth: bytesPerSec(h100.bandwidth.value),
  flopsDense: flopsPerSec(h100.flopsDense.value),
  flopsSparse: flopsPerSec(h100.flopsSparse.value),
  memory: bytes(h100.memory.value),
};
