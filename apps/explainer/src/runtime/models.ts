/**
 * Where the shipped models live: `public/models/<id>/`, served at `/models/<id>/`.
 * Loading itself (sha checks, the tokenizer path relative to the manifest) is
 * `fetchModel` in @repo/llm.
 */
import { fetchModel as fetchManifest, type LoadedModel, type ModelId } from "@repo/llm";

/** `<base><id>/manifest.json`; the base defaults to the app's `/models/`. */
export function modelManifestUrl(id: ModelId, base?: URL): URL {
  return new URL(`${id}/manifest.json`, base ?? new URL("/models/", location.href));
}

export function fetchModel(id: ModelId): Promise<LoadedModel> {
  return fetchManifest(modelManifestUrl(id));
}
