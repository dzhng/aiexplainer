/**
 * Chapters 4 and 5's run: the forward pass, in the worker. For each prompt, its last token's
 * (the focus's) attention over every token, with the words the model writes next after it
 * (greedy): those stand sealed, and the trace gives them weight 0. Also the model's guess for
 * the next word, and how far attention turned the focus word's vector toward the word it drew
 * the most from. Text longer than the scene holds keeps `<bos>` and its last tokens, and the
 * model reads exactly what the scene shows.
 */
import { promptTokens, type LoadedModel } from "@repo/llm";
import { FUTURE_WORDS, MAX_TOKENS, type AttentionStep } from "../../scene/builders/attention.ts";
import type { RunContext, SceneRunFn } from "../scene-run.ts";

export const attentionRun: SceneRunFn = async (def, text, { model, session }) => {
  if (!("manifest" in model)) throw new Error("an attention scene needs a transformer");
  const steps: AttentionStep[] = [];
  for (const prompt of text === null ? (def.loop.inputs ?? []) : [text])
    steps.push(await attentionStep(session, model, prompt));
  return { kind: "attention", steps };
};

export async function attentionStep(
  session: Pick<RunContext["session"], "run">,
  model: LoadedModel,
  prompt: string,
): Promise<AttentionStep> {
  const tokenizer = model.tokenizer;
  if (!tokenizer) throw new Error(`${model.manifest.id}: an attention scene needs a tokenizer`);
  const all = promptTokens(tokenizer, prompt);
  const room = MAX_TOKENS - FUTURE_WORDS;
  const ids = all.length > room ? [all[0]!, ...all.slice(1 - room)] : all;
  const focus = ids.length - 1;
  let guess: AttentionStep["guess"] | undefined;
  for (let k = 0; k < FUTURE_WORDS; k++) {
    const { logits } = await session.run(ids);
    const next = argmax(logits);
    guess ??= { token: tokenizer.decode([next]), p: softmaxAt(logits, next) };
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
  return {
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
}

function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

/** softmax(logits)[i], summed in f64. */
function softmaxAt(logits: ArrayLike<number>, i: number): number {
  let max = -Infinity;
  for (let j = 0; j < logits.length; j++) max = Math.max(max, logits[j]!);
  let sum = 0;
  for (let j = 0; j < logits.length; j++) sum += Math.exp(logits[j]! - max);
  return Math.exp(logits[i]! - max) / sum;
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
