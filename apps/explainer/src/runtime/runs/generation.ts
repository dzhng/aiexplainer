/**
 * Chapter 9's run: the `full` model writing a few words after the text, one step at a time,
 * with no notes kept, so every step feeds the whole text so far back through the model. The
 * worker's seeded `generate` does it (the same draw as chapter 8's page); each step reports
 * the token it wrote and how many tokens it fed.
 */
import { promptTokens, type Tokenizer } from "@repo/llm";
import { GENERATION_STEPS, type GenerationRun } from "../../scene/builders/generation.ts";
import type { SceneRunFn } from "../scene-run.ts";
import { CONTINUATION } from "./stack.ts";

export const generationRun: SceneRunFn = async (def, text, { model, session }) => {
  const prompt = text ?? def.loop.inputs?.[0] ?? "";
  const tokenizer = model.tokenizer as Tokenizer;
  const ids = promptTokens(tokenizer, prompt);
  const steps = await session.generate(ids, {
    model: "full",
    seed: CONTINUATION.seed,
    temperature: CONTINUATION.temperature,
    maxNewTokens: GENERATION_STEPS,
    cache: false,
  });
  return {
    kind: "generation",
    prompt,
    tokens: ids.map((id) => tokenizer.decode([id])),
    steps: steps.map((s) => ({ word: tokenizer.decode([s.token]), fed: s.fed })),
  } satisfies GenerationRun;
};
