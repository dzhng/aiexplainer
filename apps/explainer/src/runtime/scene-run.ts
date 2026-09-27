/**
 * The model output a chapter's scene shows, computed in the inference worker (D38): the loop's
 * inputs, or the reader's text in their place. Chapter 0 needs each word's real successors.
 */
import type { ChapterDef } from "../chapters/types.ts";
import type { SceneRun } from "../scene/build-frame.ts";
import type { Session } from "./session.ts";

/**
 * `split` turns typed text into the model's words (the counts manifest's rule); the last one
 * is the word the machine looks at. Requests run one after another: the session cancels a
 * live request when a new one starts.
 */
export async function computeRun(
  def: ChapterDef,
  text: string | null,
  session: Pick<Session, "nextWords">,
  split: (text: string) => string[],
): Promise<SceneRun | null> {
  if (def.model !== "counts") return null;
  const typed = text === null ? [] : split(text);
  const words = text === null ? (def.loop.inputs ?? []) : [typed.at(-1) ?? text.trim()];
  const steps: SceneRun["steps"] = [];
  for (const word of words)
    steps.push({ word, next: await session.nextWords(word, def.slider.max) });
  return { kind: "counts", steps };
}
