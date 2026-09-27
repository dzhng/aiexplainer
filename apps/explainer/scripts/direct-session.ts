/**
 * The inference session's requests answered in-process (bun only), from the same @repo/llm
 * calls the worker makes, for tests and the fixture scripts.
 */
import { countsModel, nextWords, type ModelSource } from "@repo/llm";
import type { RunContext } from "../src/runtime/scene-run.ts";

export function directSession(model: ModelSource): RunContext["session"] {
  const counts = "manifest" in model && model.manifest.kind === "word-counts" ? model : null;
  const table = counts && countsModel(counts);
  return {
    async nextWords(word, k) {
      if (!table) throw new Error("nextWords needs a loaded counts model");
      return nextWords(table, word, k);
    },
  };
}
