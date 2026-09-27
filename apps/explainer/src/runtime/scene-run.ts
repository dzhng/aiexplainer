/**
 * The model output a chapter's scene shows, computed in the inference worker (D38): the loop's
 * inputs, or the reader's text in their place. Chapter 0 needs each word's real successors;
 * the attention scenes need the last token's real attention weights.
 */
import { countsModel, promptTokens, type LoadedModel } from "@repo/llm";
import type { ChapterDef } from "../chapters/types.ts";
import type { AttentionStep, SceneRun } from "../scene/build-frame.ts";
import { FUTURE_WORDS, MAX_TOKENS } from "../scene/builders/attention.ts";
import type { Session } from "./session.ts";

/** Each loaded counts model's word rule, decoded once (the vocabulary is thousands of words). */
const splitters = new WeakMap<LoadedModel, (text: string) => string[]>();
function splitter(model: LoadedModel): (text: string) => string[] {
  let split = splitters.get(model);
  if (!split) splitters.set(model, (split = countsModel(model).split));
  return split;
}

/**
 * `model` is the chapter's model as loaded on the main thread: its word rule or tokenizer
 * turns text into what the worker runs. Requests run one after another: the session cancels
 * a live request when a new one starts.
 */
export async function computeRun(
  def: ChapterDef,
  text: string | null,
  session: Pick<Session, "nextWords" | "run">,
  model: LoadedModel,
): Promise<SceneRun | null> {
  const prompts = text === null ? (def.loop.inputs ?? []) : [text];
  switch (def.scene) {
    case "autocomplete": {
      // The machine reads only the last word of typed text.
      const words = text === null ? prompts : [splitter(model)(text).at(-1) ?? text.trim()];
      const steps: Extract<SceneRun, { kind: "counts" }>["steps"] = [];
      for (const word of words)
        steps.push({ word, next: await session.nextWords(word, def.slider.max) });
      return { kind: "counts", steps };
    }
    case "attention": {
      const steps: AttentionStep[] = [];
      for (const prompt of prompts) steps.push(await attentionStep(session, model, prompt));
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
