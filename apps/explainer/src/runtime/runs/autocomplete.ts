/**
 * Chapter 0's run: for each loop text (or the reader's), its words by the counts manifest's own
 * rule, and the real successors of the last one: the only word the machine looks at.
 */
import { countsModel, type LoadedModel } from "@repo/llm";
import { BOARD_SLOTS, type CountsRun } from "../../scene/builders/autocomplete.ts";
import { inputsOf, type SceneRunFn } from "../scene-run.ts";

/** Each loaded model's word rule, decoded once (the vocabulary is thousands of words). */
const splitters = new WeakMap<LoadedModel, (text: string) => string[]>();
function splitter(model: LoadedModel): (text: string) => string[] {
  let split = splitters.get(model);
  if (!split) splitters.set(model, (split = countsModel(model).split));
  return split;
}

export const autocompleteRun: SceneRunFn = async (def, text, { model, session }) => {
  if (!("manifest" in model)) throw new Error("autocomplete needs the counts model");
  const split = splitter(model);
  const steps: CountsRun["steps"] = [];
  for (const input of inputsOf(def, text)) {
    const words = split(input);
    const word = words.at(-1) ?? input.trim();
    const next = await session.nextWords(model.manifest.id, word, BOARD_SLOTS);
    steps.push({ before: words.slice(0, -1), word, next });
  }
  return { kind: "counts", steps };
};
