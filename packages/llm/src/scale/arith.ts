/**
 * Production-scale arithmetic (D27): every "how fast / how big" number on screen comes from
 * here, computed from cited constants. All functions are pure. It is a roofline model: a step
 * takes as long as the slower of moving its bytes and doing its FLOPs, with no overheads, so
 * every speed is a ceiling, not a measurement.
 * Method: https://kipp.ly/transformer-inference-arithmetic/
 */
import type { Gpu, ModelConfig } from "./constants.ts";
import {
  bytes,
  computeTime,
  flops,
  seconds,
  transferTime,
  type Bytes,
  type Flops,
  type FlopsPerByte,
  type Seconds,
  type TokensPerSec,
} from "./units.ts";

/** Bytes per stored weight and per cached key/value number. */
export interface Precision {
  weightBytes: number;
  kvBytes: number;
}
export const BF16: Precision = { weightBytes: 2, kvBytes: 2 };

/** Parameter count from the layer shapes of a Llama-architecture model (SwiGLU MLP, GQA, RMSNorm). */
export function paramsFromShapes(cfg: ModelConfig): number {
  const { hidden: d, intermediate: ff, nHeads, nKvHeads, headDim, nLayers, vocab } = cfg;
  const attention = d * nHeads * headDim * 2 + d * nKvHeads * headDim * 2; // q, o; k, v
  const mlp = 3 * d * ff; // gate, up, down
  const norms = 2 * d;
  const embeddings = (cfg.tiedEmbeddings ? 1 : 2) * vocab * d;
  return nLayers * (attention + mlp + norms) + d + embeddings;
}

/** Parameters used in matrix multiplies per token: all but the input embedding, which is a lookup. */
export function matmulParams(cfg: ModelConfig): number {
  return cfg.tiedEmbeddings ? cfg.params : cfg.params - cfg.vocab * cfg.hidden;
}

/** One key and one value vector per KV head per layer. */
export function kvBytesPerToken(cfg: ModelConfig, bytesPerValue: number): Bytes {
  return bytes(2 * cfg.nLayers * cfg.nKvHeads * cfg.headDim * bytesPerValue);
}

export function weightBytes(cfg: ModelConfig, bytesPerParam: number): Bytes {
  return bytes(cfg.params * bytesPerParam);
}

/** FLOPs to produce one token that attends to `contextLen` positions (itself included). */
export function flopsPerToken(cfg: ModelConfig, contextLen: number): Flops {
  const attention = 4 * cfg.nLayers * cfg.nHeads * cfg.headDim * contextLen; // q·k and weights·v
  return flops(2 * matmulParams(cfg) + attention);
}

/** One decode step for `batch` sequences: every weight is read once, plus every sequence's KV cache. */
export function decodeStepSeconds(
  cfg: ModelConfig,
  gpu: Gpu,
  batch: number,
  contextLen: number,
  precision: Precision = BF16,
): Seconds {
  const moved = bytes(
    weightBytes(cfg, precision.weightBytes) +
      batch * contextLen * kvBytesPerToken(cfg, precision.kvBytes),
  );
  const work = flops(batch * flopsPerToken(cfg, contextLen));
  return seconds(Math.max(transferTime(moved, gpu.bandwidth), computeTime(work, gpu.flopsDense)));
}

/** The fastest one sequence can grow, in tokens per second, while sharing the GPU with `batch - 1` others. */
export function decodeCeilingTokPerSec(
  cfg: ModelConfig,
  gpu: Gpu,
  batch: number,
  contextLen: number,
  precision: Precision = BF16,
): TokensPerSec {
  return (1 / decodeStepSeconds(cfg, gpu, batch, contextLen, precision)) as TokensPerSec;
}

/** Tokens per second across the whole batch. */
export function batchThroughput(
  cfg: ModelConfig,
  gpu: Gpu,
  batch: number,
  contextLen: number,
  precision: Precision = BF16,
): TokensPerSec {
  return (batch / decodeStepSeconds(cfg, gpu, batch, contextLen, precision)) as TokensPerSec;
}

/**
 * The batch at which a decode step stops waiting on memory: past it, the sums for every extra
 * sequence take longer than the weights take to arrive, so throughput stops growing.
 * `Infinity` if the step never gets there (each sequence's KV reads outlast its sums).
 */
export function computeBoundBatch(
  cfg: ModelConfig,
  gpu: Gpu,
  contextLen: number,
  precision: Precision = BF16,
): number {
  const weightsTime = transferTime(weightBytes(cfg, precision.weightBytes), gpu.bandwidth);
  const perSequence =
    computeTime(flopsPerToken(cfg, contextLen), gpu.flopsDense) -
    transferTime(bytes(contextLen * kvBytesPerToken(cfg, precision.kvBytes)), gpu.bandwidth);
  return perSequence > 0 ? weightsTime / perSequence : Infinity;
}

/** Reading a `tokens`-long prompt in one pass (causal: token i attends to i positions). */
export function prefillSeconds(
  cfg: ModelConfig,
  gpu: Gpu,
  tokens: number,
  precision: Precision = BF16,
): Seconds {
  const attention = 2 * cfg.nLayers * cfg.nHeads * cfg.headDim * tokens * (tokens + 1);
  const work = flops(2 * matmulParams(cfg) * tokens + attention);
  const moved = bytes(
    weightBytes(cfg, precision.weightBytes) + tokens * kvBytesPerToken(cfg, precision.kvBytes),
  );
  return seconds(Math.max(computeTime(work, gpu.flopsDense), transferTime(moved, gpu.bandwidth)));
}

/** FLOPs the GPU can do per byte it reads; below this intensity it waits on memory. */
export function ridge(gpu: Gpu): FlopsPerByte {
  return (gpu.flopsDense / gpu.bandwidth) as FlopsPerByte;
}

/**
 * Expected tokens per target-model pass when a drafter proposes `k` tokens, each accepted
 * with probability `alpha` (i.i.d.): (1 − α^(k+1)) / (1 − α).
 * Leviathan et al. 2023, https://arxiv.org/abs/2211.17192, Equation (1) (γ = k).
 */
export function specExpectedTokens(alpha: number, k: number): number {
  if (alpha === 1) return k + 1;
  return (1 - alpha ** (k + 1)) / (1 - alpha);
}

/** How many sequences of `contextLen` tokens fit in GPU memory beside the weights. */
export function maxBatchByMemory(
  cfg: ModelConfig,
  gpu: Gpu,
  contextLen: number,
  precision: Precision = BF16,
): number {
  const free = gpu.memory - weightBytes(cfg, precision.weightBytes);
  return Math.max(0, Math.floor(free / (contextLen * kvBytesPerToken(cfg, precision.kvBytes))));
}

/** A stated assumption about which parameters every token uses in a mixture of experts. */
export interface MoeAssumption {
  name: string;
  /** Parameters outside the experts (attention, embeddings, norms, router). */
  sharedParams: number;
}

/** Parameters one token touches: the shared part plus `topK` of `experts` equal experts. */
export function moeActiveParams(
  total: number,
  experts: number,
  topK: number,
  assumption: MoeAssumption,
): number {
  return assumption.sharedParams + ((total - assumption.sharedParams) * topK) / experts;
}

/**
 * Llama-3-8B is not a mixture of experts. This hypothetical keeps its attention and
 * embeddings shared and makes each expert a full copy of its MLPs (Mixtral's layout).
 */
export function llamaAsMoe(cfg: ModelConfig, experts: number): MoeAssumption & { total: number } {
  const mlps = cfg.nLayers * 3 * cfg.hidden * cfg.intermediate;
  const sharedParams = cfg.params - mlps;
  return {
    name: `${cfg.name} with each layer's MLP copied into ${experts} experts (hypothetical)`,
    sharedParams,
    total: sharedParams + experts * mlps,
  };
}
