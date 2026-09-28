/**
 * Chapter 10's run on the `full` model: the same seeded draw as chapter 9, written with a KV
 * cache (the first step feeds the prompt, every later step one token), and again with a
 * sliding window whose cache keeps only the last `KV_WINDOW` positions, to show that the
 * window changes what the model writes.
 */
import { modelMetric, promptTokens, type Tokenizer } from "@repo/llm";
import { KV_STEPS, KV_WINDOW, type KvRun } from "../../scene/builders/kv-cache.ts";
import type { SceneRunFn } from "../scene-run.ts";
import { CONTINUATION } from "./stack.ts";

export const kvCacheRun: SceneRunFn = async (def, text, { model, session }) => {
  const prompt = text ?? def.loop.inputs?.[0] ?? "";
  const tokenizer = model.tokenizer as Tokenizer;
  const ids = promptTokens(tokenizer, prompt);
  const draw = {
    model: "full" as const,
    seed: CONTINUATION.seed,
    temperature: CONTINUATION.temperature,
  };
  const cached = await session.generate(ids, { ...draw, maxNewTokens: KV_STEPS });
  const windowed = await session.generate(ids, {
    ...draw,
    maxNewTokens: KV_STEPS,
    window: KV_WINDOW,
  });
  const arch =
    "manifest" in model && model.manifest.kind === "transformer" ? model.manifest.arch : null;
  if (!arch) throw new Error("the kv-cache chapter needs the full transformer");
  return {
    kind: "kv-cache",
    prompt,
    tokens: ids.map((id) => tokenizer.decode([id])),
    steps: cached.map((s) => ({ word: tokenizer.decode([s.token]), fed: s.fed })),
    windowed: windowed.map((s) => tokenizer.decode([s.token])),
    window: KV_WINDOW,
    layers: arch.nLayers,
    heads: arch.nHeads,
    kvHeads: arch.nKvHeads,
    bytesPerToken: modelMetric(model, "kvBytesPerToken"),
  } satisfies KvRun;
};
