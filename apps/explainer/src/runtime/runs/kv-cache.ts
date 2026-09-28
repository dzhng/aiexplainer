/**
 * Chapter 10's run on the `full` model: the same seeded draw as chapter 9, written with a KV
 * cache (the first step feeds the prompt, every later step one token), and again for every
 * sliding window the chapter's slider offers below its top ("all"), each with a ring cache
 * that keeps only the last `window` positions: whether the window changes what the model
 * writes is measured, never assumed.
 */
import { modelMetric, promptTokens } from "@repo/llm";
import { KV_STEPS, type KvRun } from "../../scene/builders/kv-cache.ts";
import { CONTINUATION } from "../../chapters/data/stack.ts";
import { promptOf, transformerOf, type SceneRunFn } from "../scene-run.ts";

export const kvCacheRun: SceneRunFn = async (def, text, { model, session }) => {
  const prompt = promptOf(def, text);
  const { arch, tokenizer } = transformerOf(model, "the kv-cache chapter");
  const ids = promptTokens(tokenizer, prompt);
  const draw = {
    model: "full" as const,
    seed: CONTINUATION.seed,
    temperature: CONTINUATION.temperature,
  };
  const cached = await session.generate(ids, { ...draw, maxNewTokens: KV_STEPS });
  if (!def.slider) throw new Error("the kv-cache chapter needs its window slider");
  const windowed: KvRun["windowed"] = [];
  for (let window = def.slider.min; window < def.slider.max; window += def.slider.step) {
    const steps = await session.generate(ids, { ...draw, maxNewTokens: KV_STEPS, window });
    windowed.push({ window, words: steps.map((s) => tokenizer.decode([s.token])) });
  }
  return {
    kind: "kv-cache",
    prompt,
    tokens: ids.map((id) => tokenizer.decode([id])),
    steps: cached.map((s) => ({ word: tokenizer.decode([s.token]), fed: s.fed })),
    windowed,
    layers: arch.nLayers,
    heads: arch.nHeads,
    kvHeads: arch.nKvHeads,
    bytesPerToken: modelMetric(model, "kvBytesPerToken"),
  } satisfies KvRun;
};
