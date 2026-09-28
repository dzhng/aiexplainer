/**
 * Chapter 3's run: the forward pass, in the worker. For each input, the next-token scores
 * after its last token over the whole vocabulary, their mean, and the highest ones in order.
 */
import { promptTokens } from "@repo/llm";
import { SCORE_BARS, type LogitsRun } from "../../scene/builders/sampling.ts";
import type { SceneRunFn } from "../scene-run.ts";

/** The ids of the `k` highest scores, highest first. */
function topScores(logits: ArrayLike<number>, k: number): number[] {
  return Array.from({ length: logits.length }, (_, i) => i)
    .sort((a, b) => logits[b]! - logits[a]!)
    .slice(0, k);
}

export const samplingRun: SceneRunFn = async (def, text, { model, session }) => {
  if (!("manifest" in model) || !model.tokenizer) throw new Error("sampling needs `embed`");
  const { tokenizer } = model;
  const steps: LogitsRun["steps"] = [];
  for (const input of text === null ? (def.loop.inputs ?? []) : [text]) {
    const tokens = promptTokens(tokenizer, input);
    const { logits } = await session.run(tokens);
    steps.push({
      text: input,
      last: tokenizer.decode([tokens.at(-1)!]),
      logits: Array.from(logits),
      meanLogit: logits.reduce((sum, l) => sum + l, 0) / logits.length,
      top: topScores(logits, SCORE_BARS).map((id) => ({
        id,
        text: tokenizer.decode([id]),
        logit: logits[id]!,
      })),
    });
  }
  return { kind: "logits", steps };
};
