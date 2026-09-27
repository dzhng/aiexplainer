/**
 * Writes a chapter's committed fixture run (`src/lab/fixtures/runs/<slug>.json`) from the real
 * shipped models, through the same `computeRun` the app uses (in-process, `localSession`), so
 * `/lab/scene/<slug>` shows exactly what the app would, with no inference at view time.
 *
 *   bun scripts/scene-run.ts autocomplete
 */
import { fetchModel } from "@repo/llm";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CHAPTERS } from "../src/chapters/index.ts";
import type { ChapterSlug } from "../src/chapters/ladder.ts";
import { localSession } from "../src/runtime/local-session.ts";
import { modelManifestUrl } from "../src/runtime/models.ts";
import { computeRun } from "../src/runtime/scene-run.ts";

const appRoot = path.resolve(import.meta.dirname, "..");
const slug = process.argv[2] as ChapterSlug;
const def = CHAPTERS[slug];
if (!def) throw new Error(`no written chapter "${slug}"`);
if (def.model === null) throw new Error(`${slug} has no model, so no run`);

const modelsUrl = pathToFileURL(path.join(appRoot, "public/models/"));
const session = localSession(modelsUrl);
await session.load(def.model);
const model = await fetchModel(modelManifestUrl(def.model, modelsUrl));
const run = await computeRun(def, null, session, model);
const out = path.join(appRoot, "src/lab/fixtures/runs", `${slug}.json`);
await Bun.write(out, `${JSON.stringify(run, null, 2)}\n`);
console.log("wrote", path.relative(appRoot, out));
