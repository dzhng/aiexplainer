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
 * Text longer than the scene holds keeps `<bos>` and its last tokens, and the model reads
 * exactly what the scene shows.
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
  for (let k = 0; k < FUTURE_WORDS; k++) {
    const { logits } = await session.run(ids);
    let next = 0;
    for (let v = 1; v < logits.length; v++) if (logits[v]! > logits[next]!) next = v;
    ids.push(next);
  }
  const { trace } = await session.run(ids, { tokens: [focus], heads: [0], layers: [0] });
  const weights = trace?.layers[0]?.attn?.weights.data;
  if (!weights) throw new Error("the attention trace is missing its weights");
  return {
    tokens: ids.map((id) => tokenizer.decode([id])),
    focus,
    weights: Array.from(weights),
  };
}
