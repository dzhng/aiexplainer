/**
 * The inference session's requests answered in-process (bun only), from the same @repo/llm
 * calls the worker makes, for tests and the fixture scripts.
 */
import { countsModel, forward, nextWords, transformerModel, type ModelSource } from "@repo/llm";
import type { RunContext } from "../src/runtime/scene-run.ts";

export function directSession(model: ModelSource): RunContext["session"] {
  const loaded = "manifest" in model ? model : null;
  const table = loaded?.manifest.kind === "word-counts" ? countsModel(loaded) : null;
  const network = loaded?.manifest.kind === "transformer" ? transformerModel(loaded) : null;
  return {
    async nextWords(word, k) {
      if (!table) throw new Error("nextWords needs a loaded counts model");
      return nextWords(table, word, k);
    },
    async run(tokens, trace, window) {
      if (!network) throw new Error("run needs a loaded transformer");
      return forward(network, tokens, { trace, window });
    },
  };
}
