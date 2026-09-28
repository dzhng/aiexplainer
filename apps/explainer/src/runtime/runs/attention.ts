/**
 * Chapters 4 and 5's run: the forward pass, in the worker. For each prompt, its last token's
 * (the focus's) attention over every token, with the words the model writes next after it
 * (greedy): those stand sealed, and the trace gives them weight 0. Also the model's guess for
 * the next word, and how far attention turned the focus word's vector toward the word it drew
 * the most from. Text longer than the scene holds keeps `<bos>` and its last tokens, and the
 * model reads exactly what the scene shows.
 */
import { promptTokens, type LoadedModel } from "@repo/llm";
import {
  CLOCK_PAIR,
  FUTURE_WORDS,
  MAX_TOKENS,
  reorderFrom,
  type AttentionStep,
} from "../../scene/builders/attention.ts";
import type { RunContext, SceneRunFn } from "../scene-run.ts";

export const attentionRun: SceneRunFn = async (def, text, { model, session }) => {
  if (!("manifest" in model)) throw new Error("an attention scene needs a transformer");
  // A scenario can hold two orders of the same words, "first / second".
  const prompts = text === null ? (def.loop.inputs ?? []) : text.split(" / ");
  const steps: AttentionStep[] = [];
  const next: Float64Array[] = [];
  for (const prompt of prompts) {
    const { step, probs } = await attentionStep(session, model, prompt);
    steps.push(step);
    next.push(probs);
  }
  const { manifest } = model;
  if (manifest.kind !== "transformer" || manifest.arch.positions !== "rope")
    return { kind: "attention", steps };
  const { arch } = manifest;
  // RoPE turns pair i of each head by position × ropeTheta^(−2i / headDim).
  const headDim = arch.dModel / arch.nHeads;
  const radPerToken = Math.pow(arch.ropeTheta, (-2 * CLOCK_PAIR) / headDim);
  const reordered = steps.length === 2 && reorderFrom(steps[0]!, steps[1]!) !== null;
  const change = reordered ? totalVariation(next[0]!, next[1]!) : null;
  return { kind: "attention", steps, positions: { radPerToken, change } };
};

/** Half the summed absolute difference of two distributions: how much of one must move. */
export function totalVariation(p: ArrayLike<number>, q: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) sum += Math.abs(p[i]! - q[i]!);
  return sum / 2;
}

export async function attentionStep(
  session: Pick<RunContext["session"], "run">,
  model: LoadedModel,
  prompt: string,
): Promise<{ step: AttentionStep; probs: Float64Array }> {
  const tokenizer = model.tokenizer;
  if (!tokenizer) throw new Error(`${model.manifest.id}: an attention scene needs a tokenizer`);
  const all = promptTokens(tokenizer, prompt);
  const room = MAX_TOKENS - FUTURE_WORDS;
  const ids = all.length > room ? [all[0]!, ...all.slice(1 - room)] : all;
  const focus = ids.length - 1;
  let guess: AttentionStep["guess"] | undefined;
  let probs: Float64Array | undefined;
  for (let k = 0; k < FUTURE_WORDS; k++) {
    const { logits } = await session.run(ids);
    const next = argmax(logits);
    probs ??= softmax(logits);
    guess ??= { token: tokenizer.decode([next]), p: probs[next]! };
    ids.push(next);
  }
  // Every token traced: the focus row's weights, and the vectors before and after attention.
  const { trace } = await session.run(ids, { trace: { heads: [0], layers: [0] } });
  const attn = trace?.layers[0]?.attn;
  if (!attn) throw new Error("the attention trace is missing");
  const keys = attn.weights.shape[2]!;
  const weights = Array.from(attn.weights.data.subarray(focus * keys, (focus + 1) * keys));
  // The word the focus draws the most from, other than itself.
  let referent = 0;
  for (let i = 1; i < focus; i++) if (weights[i]! > weights[referent]!) referent = i;
  const d = attn.residual.residualIn.shape[1]!;
  const row = (t: { data: Float32Array }, i: number) => t.data.subarray(i * d, (i + 1) * d);
  const target = row(attn.residual.residualIn, referent);
  const step: AttentionStep = {
    tokens: ids.map((id) => tokenizer.decode([id])),
    focus,
    weights,
    guess: guess!,
    turn: {
      referent,
      before: angleDeg(row(attn.residual.residualIn, focus), target),
      after: angleDeg(row(attn.residual.sum, focus), target),
    },
  };
  return { step, probs: probs! };
}

function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

/** softmax(logits), summed in f64. */
function softmax(logits: ArrayLike<number>): Float64Array {
  let max = -Infinity;
  for (let j = 0; j < logits.length; j++) max = Math.max(max, logits[j]!);
  const out = new Float64Array(logits.length);
  let sum = 0;
  for (let j = 0; j < logits.length; j++) sum += out[j] = Math.exp(logits[j]! - max);
  for (let j = 0; j < out.length; j++) out[j]! /= sum;
  return out;
}

/** The angle between two vectors, in degrees. */
export function angleDeg(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return (Math.acos(Math.max(-1, Math.min(1, dot / Math.sqrt(na * nb)))) * 180) / Math.PI;
}
