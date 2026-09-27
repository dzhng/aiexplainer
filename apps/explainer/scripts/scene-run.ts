/**
 * Writes a chapter's committed fixture run (`src/lab/fixtures/runs/<slug>.json`) from the real
 * shipped model, through the same `computeRun` the app uses, so `/lab/scene/<slug>` shows
 * exactly what the app would, with no inference at view time.
 *
 *   bun scripts/scene-run.ts autocomplete
 */
import path from "node:path";
import { CHAPTERS } from "../src/chapters/index.ts";
import type { ChapterSlug } from "../src/chapters/ladder.ts";
import { computeRun } from "../src/runtime/scene-run.ts";
import { directSession } from "./direct-session.ts";
import { shipped } from "./shipped.ts";

const appRoot = path.resolve(import.meta.dirname, "..");
const slug = process.argv[2] as ChapterSlug;
const def = CHAPTERS[slug];
if (!def) throw new Error(`no written chapter "${slug}"`);
if (def.model === null) throw new Error(`${slug}: a chapter without a model has no run`);

const model = await shipped(def.model);
const run = await computeRun(def, null, { model, session: directSession(model) });
const out = path.join(appRoot, "src/lab/fixtures/runs", `${slug}.json`);
await Bun.write(out, `${JSON.stringify(run, null, 2)}\n`);
console.log("wrote", path.relative(appRoot, out));
