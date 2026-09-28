/**
 * Chapter 15's run: no inference of its own. Each station's chapter computes its own run on
 * its own model, exactly as that chapter does (`computeRun`), for its loop inputs or the
 * reader's text; one after another, since the worker answers one request at a time.
 */
import { STATIONS } from "../../chapters/data/finished.ts";
import type { FinishedRun } from "../../scene/build-frame.ts";
import { computeRun, type RunContext } from "../scene-run.ts";

// A function declaration, not a const: `scene-run.ts` lists it while this module imports that one.
export async function finishedRun(
  _def: unknown,
  text: string | null,
  ctx: RunContext,
): Promise<FinishedRun> {
  const runs: FinishedRun["runs"] = {};
  for (const { def } of STATIONS) {
    if (def.model === null) {
      runs[def.slug] = null;
      continue;
    }
    const model = await ctx.source(def.model);
    if (def.model !== "tokenizer") await ctx.session.load(def.model);
    runs[def.slug] = await computeRun(def, text, { ...ctx, model });
  }
  return { kind: "finished", runs };
}
