/**
 * The model output a chapter's scene shows: the loop's inputs, or the reader's text in their
 * place, run through the chapter's model. Anything that runs a network goes to the inference
 * worker (D38); table lookups (chapter 0's word rule, chapter 1's tokenizer) read the model the
 * main thread already holds for the HUD's stats. The run's shape is the scene builder's.
 */
import {
  countsModel,
  probeResult,
  sourceEvidence,
  type LoadedModel,
  type ModelSource,
} from "@repo/llm";
import { CONTINUE_WORDS, STRIP } from "../chapters/data/quantization.ts";
import type { ChapterDef } from "../chapters/types.ts";
import type { SceneRun } from "../scene/build-frame.ts";
import type { Session } from "./session.ts";

export interface RunContext {
  /** The chapter's model on the main thread (the same one the HUD's stats read). */
  model: ModelSource;
  /** The inference worker, holding the chapter's model. Requests run one after another. */
  session: Pick<Session, "nextWords" | "continueText" | "weights">;
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
    case "quantization": {
      // Both machines continue the same text; the strip reads both models' stored weights.
      const prompt = inputsOf(def, text)[0] ?? "";
      const { session } = ctx;
      const full = await session.continueText("full", prompt, CONTINUE_WORDS);
      const q8 = await session.continueText("full-q8", prompt, CONTINUE_WORDS);
      const f16 = await session.weights("full", STRIP.tensor, STRIP.start, STRIP.count);
      const int8 = await session.weights("full-q8", STRIP.tensor, STRIP.start, STRIP.count);
      if (!int8.q8) throw new Error(`full-q8's ${STRIP.tensor} is not q8_0`);
      const words = (c: typeof full) => c.tokens.map(({ text, p }) => ({ text, p }));
      return {
        kind: "quantization",
        prompt,
        full: words(full),
        q8: words(q8),
        strip: { ...STRIP, full: f16.values, q8: int8.values, ...int8.q8 },
        byteRatio: probeResult(sourceEvidence(model), "q8-bytes").value,
      };
    }
    case "batching":
      // Chapter 11 is arithmetic only (D27): no model runs.
      return null;
  }
}
