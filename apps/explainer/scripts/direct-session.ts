/**
 * The inference session's requests answered in-process (bun only), from the same @repo/llm
 * calls the worker makes, for tests and the fixture scripts.
 */
import {
  continueText,
  countsModel,
  nextWords,
  transformerModel,
  weightSlice,
  type LoadedModel,
  type ModelId,
  type ModelSource,
  type Transformer,
} from "@repo/llm";
import type { RunContext } from "../src/runtime/scene-run.ts";
import { shippedModel } from "./shipped.ts";

export function directSession(model: ModelSource): RunContext["session"] {
  const counts = "manifest" in model && model.manifest.kind === "word-counts" ? model : null;
  const table = counts && countsModel(counts);
  // Models a request names, loaded from disk once (the worker keeps them the same way).
  const loaded = new Map<ModelId, Promise<{ model: LoadedModel; transformer?: Transformer }>>();
  const held = (id: ModelId) => {
    let entry = loaded.get(id);
    if (!entry) {
      entry = shippedModel(id).then((m) => ({
        model: m,
        transformer: m.manifest.kind === "transformer" ? transformerModel(m) : undefined,
      }));
      loaded.set(id, entry);
    }
    return entry;
  };
  return {
    async nextWords(word, k) {
      if (!table) throw new Error("nextWords needs a loaded counts model");
      return nextWords(table, word, k);
    },
    async continueText(id, text, count) {
      const { transformer } = await held(id);
      if (!transformer) throw new Error(`${id} is not a transformer`);
      return continueText(transformer, text, count);
    },
    async weights(id, tensor, start, count) {
      return weightSlice((await held(id)).model, tensor, start, count);
    },
  };
}
