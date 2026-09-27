/**
 * The model output a chapter's scene shows: the loop's inputs, or the reader's text in their
 * place, run through the chapter's model. Anything that runs a network goes to the inference
 * worker (D38); table lookups (chapter 0's word rule, chapter 1's tokenizer, chapter 2's
 * embedding rows) read the model the main thread already holds for the HUD's stats. The run's
 * shape is the scene builder's.
 */
import {
  countsModel,
  transformerModel,
  type LoadedModel,
  type ModelSource,
  type Transformer,
} from "@repo/llm";
import type { ChapterDef } from "../chapters/types.ts";
import type { SceneRun } from "../scene/build-frame.ts";
import { MAX_PINNED_INPUT, projectRow } from "../scene/embed-map.ts";
import type { Session } from "./session.ts";

export interface RunContext {
  /** The chapter's model on the main thread (the same one the HUD's stats read). */
  model: ModelSource;
  /** The inference worker, holding the chapter's model. Requests run one after another. */
  session: Pick<Session, "nextWords">;
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
    case "embeddings": {
      // A table lookup, not a forward pass: each token's own row of the embedding table.
      if (!("manifest" in model) || !model.tokenizer) throw new Error("embeddings needs `embed`");
      const { tokenizer } = model;
      const table = transformer(model);
      const d = table.arch.dModel;
      const rowOf = (id: number) => table.tokEmb.subarray(id * d, (id + 1) * d);
      const steps = inputsOf(def, text).map((input) => {
        // Words as they sit mid-sentence, with their leading space: " cat", not "c" + "at".
        const ids = [...tokenizer.encode(` ${input.trim()}`)].slice(0, MAX_PINNED_INPUT);
        const pins = ids.map((id) => ({
          id,
          text: tokenizer.decode([id]),
          bytes: tokenizer.pieces([id])[0]!.byteSpan[1],
          at: projectRow(rowOf(id)),
        }));
        const cosine = ids.length >= 2 ? cosineOf(rowOf(ids[0]!), rowOf(ids[1]!)) : null;
        return { text: input, pins, cosine };
      });
      return { kind: "pins", steps };
    }
  }
}

/** Each loaded transformer's weights as f32, decoded once. */
const transformers = new WeakMap<LoadedModel, Transformer>();
function transformer(model: LoadedModel): Transformer {
  let t = transformers.get(model);
  if (!t) transformers.set(model, (t = transformerModel(model)));
  return t;
}

/** How nearly two embeddings point the same way: 1 same, 0 unrelated, −1 opposite. */
export function cosineOf(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let k = 0; k < a.length; k++) {
    dot += a[k]! * b[k]!;
    na += a[k]! ** 2;
    nb += b[k]! ** 2;
  }
  return dot / Math.sqrt(na * nb);
}
