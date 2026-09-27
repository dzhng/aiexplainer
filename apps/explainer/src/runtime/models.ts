/**
 * Where the shipped models live: `public/models/<id>/`, served at `/models/<id>/`; the shared
 * tokenizer (chapter 1's model) is `public/models/tokenizer/`. Loading itself (sha checks, the
 * tokenizer path relative to the manifest) is `fetchModel` / `fetchTokenizer` in @repo/llm.
 */
import {
  fetchModel as fetchManifest,
  fetchTokenizer,
  type ModelId,
  type ModelSource,
} from "@repo/llm";
import type { ChapterModelId } from "../chapters/types.ts";

const modelsBase = (base?: URL) => base ?? new URL("/models/", location.href);

/** `<base><id>/manifest.json`; the base defaults to the app's `/models/`. */
export function modelManifestUrl(id: ModelId, base?: URL): URL {
  return new URL(`${id}/manifest.json`, modelsBase(base));
}

export function fetchModel(id: ChapterModelId): Promise<ModelSource> {
  if (id === "tokenizer") return fetchTokenizer(new URL("tokenizer/", modelsBase()));
  return fetchManifest(modelManifestUrl(id));
}
