/**
 * The model output a chapter's scene shows: the loop's inputs, or the reader's text in their
 * place, run through the chapter's model. Anything that runs a network goes to the inference
 * worker (D38); table lookups (chapter 0's word rule, chapter 1's tokenizer) read the model the
 * main thread already holds for the HUD's stats. The run's shape is the scene builder's.
 */
import { countsModel, promptTokens, type LoadedModel, type ModelSource } from "@repo/llm";
import type { ChapterDef } from "../chapters/types.ts";
import type { AttentionStep, SceneRun } from "../scene/build-frame.ts";
import { FUTURE_WORDS, MAX_TOKENS } from "../scene/builders/attention.ts";
import type { Session } from "./session.ts";

export interface RunContext {
  /** The chapter's model on the main thread (the same one the HUD's stats read). */
  model: ModelSource;
  /** The inference worker, holding the chapter's model. Requests run one after another. */
  session: Pick<Session, "nextWords" | "run">;
}

/** Each counts model's word rule, decoded once (the vocabulary is thousands of words). */
const splitters = new WeakMap<LoadedModel, (text: string) => string[]>();
function splitter(model: LoadedModel): (text: string) => string[] {
  let split = splitters.get(model);
  if (!split) splitters.set(model, (split = countsModel(model).split));
  return split;
}

/** What the loop feeds the model, or the reader's text alone. */
const inputsOf = (def: ChapterDef, text: string | null) =>
  text === null ? (def.loop.inputs ?? []) : [text];

export async function computeRun(
  def: ChapterDef,
  text: string | null,
  ctx: RunContext,
): Promise<SceneRun | null> {
  const { model } = ctx;
  switch (def.scene) {
    case "autocomplete": {
      // The machine looks at the last word of typed text (the counts manifest's word rule).
      if (!("manifest" in model)) throw new Error("autocomplete needs the counts model");
      const typed = text === null ? [] : splitter(model)(text);
      const words = text === null ? (def.loop.inputs ?? []) : [typed.at(-1) ?? text.trim()];
      const steps: Extract<SceneRun, { kind: "counts" }>["steps"] = [];
      for (const word of words)
        steps.push({ word, next: await ctx.session.nextWords(word, def.slider.max) });
      return { kind: "counts", steps };
    }
    case "tokenizer": {
      const { tokenizer } = model;
      if (!tokenizer) throw new Error("the tokenizer chapter needs the shared tokenizer");
      const steps = inputsOf(def, text).map((input) => {
        const ids = tokenizer.encode(input);
        const pieces = tokenizer.pieces(ids).map(({ text, byteSpan: [start, end] }, i) => ({
          id: ids[i]!,
          text,
          bytes: end - start,
        }));
        return { text: input, pieces };
      });
      return { kind: "pieces", vocab: tokenizer.vocabSize, steps };
    }
    case "attention": {
      if (!("manifest" in model)) throw new Error("an attention scene needs a transformer");
      const steps: AttentionStep[] = [];
      for (const prompt of inputsOf(def, text))
        steps.push(await attentionStep(ctx.session, model, prompt));
      return { kind: "attention", steps };
    }
  }
}

/**
 * The prompt's last token (the focus) and its attention over every token, with the words the
 * model writes next (greedy) after it: those stand sealed, and the trace gives them weight 0.
 * Also the model's guess for the next word, and how far attention turned the focus word's
 * vector toward the word it drew the most from. Text longer than the scene holds keeps
 * `<bos>` and its last tokens, and the model reads exactly what the scene shows.
 */
export async function attentionStep(
  session: Pick<Session, "run">,
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
  const { trace } = await session.run(ids, { heads: [0], layers: [0] });
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
