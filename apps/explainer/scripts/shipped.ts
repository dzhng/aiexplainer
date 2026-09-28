/**
 * A chapter's shipped model, loaded from `public/models/` on disk (bun only): the same files
 * and checks the app fetches, for tests and the fixture scripts.
 */
import { loadModel, loadTokenizerWithEvidence, type LoadedModel, type ModelId } from "@repo/llm";
import type { LoadedTokenizer, ModelSource } from "@repo/llm";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ChapterModelId } from "../src/chapters/types.ts";
import { localSession } from "../src/runtime/local-session.ts";
import type { RunContext } from "../src/runtime/scene-run.ts";

const modelsDir = path.resolve(import.meta.dirname, "../public/models");

export async function shippedTokenizer(): Promise<LoadedTokenizer> {
  const dir = path.join(modelsDir, "tokenizer");
  return loadTokenizerWithEvidence(
    await Bun.file(path.join(dir, "tokenizer.json")).arrayBuffer(),
    await Bun.file(path.join(dir, "evidence.json")).json(),
  );
}

export async function shippedModel(id: ModelId): Promise<LoadedModel> {
  const dir = path.join(modelsDir, id);
  const manifest = await Bun.file(path.join(dir, "manifest.json")).json();
  const tokenizer =
    manifest.tokenizer.kind === "bpe"
      ? await Bun.file(path.join(dir, manifest.tokenizer.file)).arrayBuffer()
      : undefined;
  return loadModel(
    manifest,
    await Bun.file(path.join(dir, "weights.bin")).arrayBuffer(),
    tokenizer,
  );
}

export function shipped(id: ChapterModelId): Promise<ModelSource> {
  return id === "tokenizer" ? shippedTokenizer() : shippedModel(id);
}

/**
 * What `computeRun` needs for a chapter, in-process: its shipped model on "the main thread",
 * and a `localSession` (the worker's own code) holding it. Other models load on request, once.
 */
export async function shippedContext(id: ChapterModelId): Promise<RunContext> {
  const session = localSession(pathToFileURL(`${modelsDir}/`));
  if (id !== "tokenizer") await session.load(id);
  const sources = new Map<ChapterModelId, Promise<ModelSource>>();
  const source = (other: ChapterModelId) => {
    if (!sources.has(other)) sources.set(other, shipped(other));
    return sources.get(other)!;
  };
  return { model: await source(id), session, source };
}
