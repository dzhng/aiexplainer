/**
 * Chapter 13's run: seeded speculative decoding of the text with `drafter-64` guessing and
 * `full` checking, once for every k the slider offers (the rounds differ with k), each round's
 * guesses and the target's own token decoded to words. Every request names its models.
 */
import { promptTokens } from "@repo/llm";
import { SPEC_RUN } from "../../chapters/data/speculative.ts";
import type { SpeculativeRun } from "../../scene/build-frame.ts";
import { promptOf, transformerOf, type SceneRunFn } from "../scene-run.ts";

export const speculativeRun: SceneRunFn = async (def, text, { model, session }) => {
  const { tokenizer } = transformerOf(model, "speculative decoding");
  const prompt = promptOf(def, text);
  const tokens = promptTokens(tokenizer, prompt);
  await session.load("full");
  await session.load("drafter-64");
  const word = (id: number) => tokenizer.decode([id]);
  const byK: SpeculativeRun["byK"] = [];
  for (let k = def.slider.min; k <= SPEC_RUN.maxK; k++) {
    const { rounds } = await session.speculate(tokens, {
      target: "full",
      drafter: "drafter-64",
      k,
      maxNewTokens: SPEC_RUN.maxNewTokens,
      temperature: SPEC_RUN.temperature,
      seed: SPEC_RUN.seed,
    });
    byK.push({
      k,
      rounds: rounds.map((r) => ({
        drafted: r.drafted.map(word),
        accepted: r.accepted,
        next: word(r.next),
      })),
    });
  }
  return { kind: "speculative", prompt, byK };
};
