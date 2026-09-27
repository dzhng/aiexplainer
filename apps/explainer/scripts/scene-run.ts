/**
 * Writes a chapter's committed fixture run (`src/lab/fixtures/runs/<slug>.json`) from the real
 * shipped model, through the same `computeRun` the app uses, so `/lab/scene/<slug>` shows
 * exactly what the app would, with no inference at view time.
 *
 *   bun scripts/scene-run.ts autocomplete
 */
import { countsModel, loadModel, nextWords } from "@repo/llm";
import path from "node:path";
import { CHAPTERS } from "../src/chapters/index.ts";
import type { ChapterSlug } from "../src/chapters/ladder.ts";
import { computeRun } from "../src/runtime/scene-run.ts";

const appRoot = path.resolve(import.meta.dirname, "..");
const slug = process.argv[2] as ChapterSlug;
const def = CHAPTERS[slug];
if (!def) throw new Error(`no written chapter "${slug}"`);
if (def.model !== "counts") throw new Error(`${slug}: only counts runs are written so far`);

const dir = path.join(appRoot, "public/models", def.model);
const model = countsModel(
  await loadModel(
    await Bun.file(path.join(dir, "manifest.json")).json(),
    await Bun.file(path.join(dir, "weights.bin")).arrayBuffer(),
  ),
);
const session = { nextWords: async (word: string, k: number) => nextWords(model, word, k) };
const run = await computeRun(def, null, session, model.split);
const out = path.join(appRoot, "src/lab/fixtures/runs", `${slug}.json`);
await Bun.write(out, `${JSON.stringify(run, null, 2)}\n`);
console.log("wrote", path.relative(appRoot, out));
