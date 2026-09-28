/**
 * The arithmetic a stat chip may show (`StatChip.value.kind: 'arith'`). Each entry binds a
 * function to the reference model and GPU, names its numeric arguments, and declares the
 * scale and unit of its result, so a chapter names a function instead of typing a number.
 */
import {
  batchThroughput,
  computeBoundBatch,
  decodeCeilingTokPerSec,
  decodeStepSeconds,
  kvBytesPerToken,
  llamaAsMoe,
  maxBatchByMemory,
  moeActiveParams,
  prefillSeconds,
  ridge,
  specExpectedTokens,
  weightBytes,
} from "./arith.ts";
import { H100_SXM, LLAMA_3_8B } from "./constants.ts";

export type ArithUnit = "bytes" | "tok/s" | "s" | "count";
/** `null`: the result is pure math, and the chip's scale comes from where its inputs came from. */
export type ArithScale = "Llama-3-8B" | "Llama-3-8B on H100 SXM" | null;

export interface ArithEntry<A extends string = string> {
  args: readonly A[];
  unit: ArithUnit;
  scale: ArithScale;
  describe: string;
  compute(args: Record<A, number>): number;
}

const entry = <const A extends string>(e: ArithEntry<A>) => e;
const cfg = LLAMA_3_8B;
const gpu = H100_SXM;

export const ARITH = {
  params: entry({
    args: [],
    unit: "count",
    scale: "Llama-3-8B",
    describe: "parameters, counted from the layer shapes",
    compute: () => cfg.params,
  }),
  vocab: entry({
    args: [],
    unit: "count",
    scale: "Llama-3-8B",
    describe: "entries in its tokenizer's vocabulary, from the published config",
    compute: () => cfg.vocab,
  }),
  hidden: entry({
    args: [],
    unit: "count",
    scale: "Llama-3-8B",
    describe: "numbers in each token's embedding (its hidden size), from the published config",
    compute: () => cfg.hidden,
  }),
  layers: entry({
    args: [],
    unit: "count",
    scale: "Llama-3-8B",
    describe: "transformer blocks stacked one after another, from its config",
    compute: () => cfg.nLayers,
  }),
  maxContext: entry({
    args: [],
    unit: "count",
    scale: "Llama-3-8B",
    describe: "the longest text it reads at once, in tokens (its config's max positions)",
    compute: () => cfg.maxPos,
  }),
  rereadTokens: entry({
    args: ["tokens"],
    unit: "count",
    scale: null,
    describe:
      "tokens fed through the model to write a text this long when every step rereads it all (1 + 2 + … + n)",
    compute: (a) => (a.tokens * (a.tokens + 1)) / 2,
  }),
  mlpNeurons: entry({
    args: [],
    unit: "count",
    scale: "Llama-3-8B",
    describe: "MLP neurons in each block (its config's intermediate size)",
    compute: () => cfg.intermediate,
  }),
  kvBytesPerToken: entry({
    args: ["kvBytes"],
    unit: "bytes",
    scale: "Llama-3-8B",
    describe: "KV cache per token: 2 × layers × KV heads × head size × bytes",
    compute: (a) => kvBytesPerToken(cfg, a.kvBytes),
  }),
  weightBytes: entry({
    args: ["weightBytes"],
    unit: "bytes",
    scale: "Llama-3-8B",
    describe: "weights in memory: parameters × bytes per parameter",
    compute: (a) => weightBytes(cfg, a.weightBytes),
  }),
  decodeCeilingTokPerSec: entry({
    args: ["batch", "contextLen", "weightBytes", "kvBytes"],
    unit: "tok/s",
    scale: "Llama-3-8B on H100 SXM",
    describe: "fastest one sequence can grow (weights + KV cache read every step)",
    compute: (a) => decodeCeilingTokPerSec(cfg, gpu, a.batch, a.contextLen, a),
  }),
  batchThroughput: entry({
    args: ["batch", "contextLen", "weightBytes", "kvBytes"],
    unit: "tok/s",
    scale: "Llama-3-8B on H100 SXM",
    describe: "tokens per second across the whole batch",
    compute: (a) => batchThroughput(cfg, gpu, a.batch, a.contextLen, a),
  }),
  decodeStepSeconds: entry({
    args: ["batch", "contextLen", "weightBytes", "kvBytes"],
    unit: "s",
    scale: "Llama-3-8B on H100 SXM",
    describe:
      "one decode step for the whole batch: the slower of reading the bytes and doing the sums",
    compute: (a) => decodeStepSeconds(cfg, gpu, a.batch, a.contextLen, a),
  }),
  computeBoundBatch: entry({
    args: ["contextLen", "weightBytes", "kvBytes"],
    unit: "count",
    scale: "Llama-3-8B on H100 SXM",
    describe:
      "the batch where a decode step's sums take as long as reading its bytes; past it, more sequences add no throughput",
    compute: (a) => computeBoundBatch(cfg, gpu, a.contextLen, a),
  }),
  prefillSeconds: entry({
    args: ["tokens", "weightBytes", "kvBytes"],
    unit: "s",
    scale: "Llama-3-8B on H100 SXM",
    describe: "reading a prompt in one pass",
    compute: (a) => prefillSeconds(cfg, gpu, a.tokens, a),
  }),
  ridge: entry({
    args: [],
    unit: "count",
    scale: null,
    describe: "H100 SXM: FLOPs per byte read before the GPU stops waiting on memory",
    compute: () => ridge(gpu),
  }),
  maxBatchByMemory: entry({
    args: ["contextLen", "weightBytes", "kvBytes"],
    unit: "count",
    scale: "Llama-3-8B on H100 SXM",
    describe: "sequences whose KV caches fit beside the weights",
    compute: (a) => maxBatchByMemory(cfg, gpu, a.contextLen, a),
  }),
  specExpectedTokens: entry({
    args: ["alpha", "k"],
    unit: "count",
    scale: null,
    describe: "tokens per target pass with k drafted tokens (Leviathan et al. 2023, Eq. 1)",
    compute: (a) => specExpectedTokens(a.alpha, a.k),
  }),
  moeActiveParams: entry({
    args: ["experts", "topK"],
    unit: "count",
    scale: "Llama-3-8B",
    describe: "parameters per token if Llama-3-8B's MLPs were split into experts (hypothetical)",
    compute: (a) => {
      const moe = llamaAsMoe(cfg, a.experts);
      return moeActiveParams(moe.total, a.experts, a.topK, moe);
    },
  }),
};

export type ArithFnName = keyof typeof ARITH;

export function isArithFn(name: string): name is ArithFnName {
  return Object.hasOwn(ARITH, name);
}

/** Everything wrong with calling `fn` with `args` (empty when the call is valid). */
export function arithProblems(fn: string, args: Record<string, number>): string[] {
  if (!isArithFn(fn)) return [`unknown arithmetic function ${fn}`];
  const e: ArithEntry = ARITH[fn];
  const problems: string[] = [];
  for (const k of e.args)
    if (!Number.isFinite(args[k])) problems.push(`${fn}: missing argument ${k}`);
  for (const k of Object.keys(args))
    if (!e.args.includes(k)) problems.push(`${fn}: unexpected argument ${k}`);
  return problems;
}

export function evalArith(fn: ArithFnName, args: Record<string, number>): number {
  const problems = arithProblems(fn, args);
  if (problems.length) throw new Error(problems.join("; "));
  return (ARITH[fn] as ArithEntry).compute(args);
}
