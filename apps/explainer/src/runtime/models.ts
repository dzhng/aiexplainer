/**
 * Fetches a model's files from `public/models/<id>/` and loads them (sha-checked). A BPE
 * model's `tokenizer.file` is resolved against `/models/`, e.g. `tokenizer/tokenizer.json`.
 */
import { ModelManifest, loadModel, type LoadedModel, type ModelId } from "@repo/llm";

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

export async function fetchModel(id: ModelId): Promise<LoadedModel> {
  const dir = `/models/${id}/`;
  const manifest = ModelManifest.parse(await (await fetchOk(dir + "manifest.json")).json());
  const weights = await (await fetchOk(dir + manifest.weightsFile)).arrayBuffer();
  const tokenizer =
    manifest.tokenizer.kind === "bpe"
      ? await (await fetchOk(`/models/${manifest.tokenizer.file}`)).arrayBuffer()
      : undefined;
  return loadModel(manifest, weights, tokenizer);
}
