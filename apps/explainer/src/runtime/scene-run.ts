/**
 * The model output a chapter's scene shows: the loop's inputs, or the reader's text in their
 * place, run through the chapter's model. Anything that runs a network goes to the inference
 * worker (D38); table lookups (chapter 0's word rule, chapter 1's tokenizer, chapter 2's
 * embedding rows) read the model the main thread already holds for the HUD's stats. Each scene that shows model output has one run function
 * (`runs/<scene>.ts`); this picks it. The run's shape is the scene builder's.
 */
import type { ModelSource } from "@repo/llm";
import type { SceneBuilderId } from "../chapters/scenes.ts";
import type { ChapterDef } from "../chapters/types.ts";
import type { SceneRun } from "../scene/build-frame.ts";
import { autocompleteRun } from "./runs/autocomplete.ts";
import { embeddingsRun } from "./runs/embeddings.ts";
import { mlpRun } from "./runs/mlp.ts";
import { residualRun } from "./runs/residual.ts";
import { samplingRun } from "./runs/sampling.ts";
import { stackRun } from "./runs/stack.ts";
import { tokenizerRun } from "./runs/tokenizer.ts";
import type { Session } from "./session.ts";

/** What a run may ask of the chapter's model and the inference session. */
export interface RunContext {
  /** The chapter's model on the main thread (the same one the HUD's stats read). */
  model: ModelSource;
  /**
   * The inference worker, holding the chapter's model (and any other a run loads and names).
   * Requests run one after another: the session cancels a live request when a new one starts.
   */
  session: Pick<Session, "load" | "run" | "generate" | "nextWords">;
}

/** Computes one scene's run for the loop's inputs, or for the reader's text alone. */
export type SceneRunFn = (
  def: ChapterDef,
  text: string | null,
  ctx: RunContext,
) => Promise<SceneRun>;

const RUNS: Partial<Record<SceneBuilderId, SceneRunFn>> = {
  autocomplete: autocompleteRun,
  tokenizer: tokenizerRun,
  embeddings: embeddingsRun,
  sampling: samplingRun,
  mlp: mlpRun,
  residual: residualRun,
  stack: stackRun,
};

/** The scene's run, or null for a chapter whose scene shows no model output. */
export async function computeRun(
  def: ChapterDef,
  text: string | null,
  ctx: RunContext,
): Promise<SceneRun | null> {
  const run = RUNS[def.scene];
  return run ? run(def, text, ctx) : null;
}
