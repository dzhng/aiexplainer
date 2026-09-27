/**
 * The model output a chapter's scene shows, computed through the inference session (D38): the
 * loop's inputs, or the reader's text in their place. Each scene that shows model output has
 * one run function (`runs/<scene>.ts`); this picks it. Requests run one after another: the
 * session cancels a live request when a new one starts.
 */
import type { LoadedModel } from "@repo/llm";
import type { SceneBuilderId } from "../chapters/scenes.ts";
import type { ChapterDef } from "../chapters/types.ts";
import type { SceneRun } from "../scene/build-frame.ts";
import { autocompleteRun } from "./runs/autocomplete.ts";
import { mlpRun } from "./runs/mlp.ts";
import type { Session } from "./session.ts";

/** What a run function may ask of the session. */
export type RunSession = Pick<Session, "load" | "run" | "nextWords">;

/**
 * Computes one scene's run. `model` is the chapter's own model, loaded on the main thread (its
 * tokenizer or word rule turns text into the model's input); the session holds it too.
 */
export type SceneRunFn = (
  def: ChapterDef,
  text: string | null,
  session: RunSession,
  model: LoadedModel,
) => Promise<SceneRun>;

const RUNS: Partial<Record<SceneBuilderId, SceneRunFn>> = {
  autocomplete: autocompleteRun,
  mlp: mlpRun,
};

/** The scene's run, or null for a chapter whose scene shows no model output. */
export async function computeRun(
  def: ChapterDef,
  text: string | null,
  session: RunSession,
  model: LoadedModel,
): Promise<SceneRun | null> {
  const run = RUNS[def.scene];
  return run ? run(def, text, session, model) : null;
}
