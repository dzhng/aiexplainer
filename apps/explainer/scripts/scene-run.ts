/**
 * Writes a chapter's committed fixture run (`src/lab/fixtures/runs/<slug>.json`) from the real
 * shipped model, through the same `computeRun` the app uses, so `/lab/scene/<slug>` shows
 * exactly what the app would, with no inference at view time.
 *
 *   bun scripts/scene-run.ts autocomplete
 */
import {
  countsModel,
  forward,
  loadModel,
  nextWords,
  transformerModel,
  type LoadedModel,
  type TraceSpec,
} from "@repo/llm";
import path from "node:path";
import { CHAPTERS } from "../src/chapters/index.ts";
import type { ChapterSlug } from "../src/chapters/ladder.ts";
import { computeRun } from "../src/runtime/scene-run.ts";

const appRoot = path.resolve(import.meta.dirname, "..");
const slug = process.argv[2] as ChapterSlug;
const def = CHAPTERS[slug];
if (!def) throw new Error(`no written chapter "${slug}"`);
if (!def.model) throw new Error(`${slug} has no model, so no run`);

const dir = path.join(appRoot, "public/models", def.model);
const manifest = await Bun.file(path.join(dir, "manifest.json")).json();
const loaded: LoadedModel = await loadModel(
  manifest,
  await Bun.file(path.join(dir, "weights.bin")).arrayBuffer(),
  manifest.tokenizer.kind === "bpe"
    ? await Bun.file(path.join(dir, manifest.tokenizer.file)).arrayBuffer()
    : undefined,
);
// The worker's answers, computed here in-process from the same shipped files.
const session = {
  nextWords: async (word: string, k: number) => nextWords(countsModel(loaded), word, k),
  run: async (tokens: number[], trace?: TraceSpec) =>
    forward(transformerModel(loaded), tokens, { trace }),
};
const run = await computeRun(def, null, session, loaded);
const out = path.join(appRoot, "src/lab/fixtures/runs", `${slug}.json`);
await Bun.write(out, `${JSON.stringify(run, null, 2)}\n`);
console.log("wrote", path.relative(appRoot, out));
