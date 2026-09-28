/**
 * A `Session` that runs `createInference` in-process instead of in a worker: for bun tests and
 * the fixture-run script, which need the app's exact model output without a browser. It never
 * cancels (every call finishes before the next starts).
 */
import { createInference } from "./inference.ts";
import { modelManifestUrl } from "./models.ts";
import type { Session } from "./session.ts";

export function localSession(modelsUrl: URL): Session {
  const inference = createInference();
  return {
    load: async (model) =>
      inference.load(model instanceof URL ? model : modelManifestUrl(model, modelsUrl)),
    run: async (tokens, options) => inference.run(tokens, options),
    generate: (tokens, options) => inference.generate(tokens, options),
    nextWords: async (word, k) => inference.nextWords(word, k),
    neighbours: async (token, k) => inference.neighbours(token, k),
    cancel() {},
    dispose() {},
  };
}
