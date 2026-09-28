/**
 * Chapter 0's run: each loop word's real successors from the counts model, or the successors
 * of the last word the reader typed (split by the counts manifest's own rule).
 */
import { countsModel, type LoadedModel } from "@repo/llm";
import type { CountsRun } from "../../scene/builders/autocomplete.ts";
import type { SceneRunFn } from "../scene-run.ts";

/** Each loaded model's word rule, decoded once (the vocabulary is thousands of words). */
const splitters = new WeakMap<LoadedModel, (text: string) => string[]>();
function splitter(model: LoadedModel): (text: string) => string[] {
  let split = splitters.get(model);
  if (!split) splitters.set(model, (split = countsModel(model).split));
  return split;
}

export const autocompleteRun: SceneRunFn = async (def, text, { model, session }) => {
  if (!("manifest" in model)) throw new Error("autocomplete needs the counts model");
  const typed = text === null ? [] : splitter(model)(text);
  const words = text === null ? (def.loop.inputs ?? []) : [typed.at(-1) ?? text.trim()];
  const steps: CountsRun["steps"] = [];
  for (const word of words)
    steps.push({ word, next: await session.nextWords(word, def.slider.max) });
  return { kind: "counts", steps };
};
