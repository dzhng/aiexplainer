/**
 * Chapter 8's run on the `full` model: where each of its heads looks from the last word, in
 * every layer (the trace's attention weights), and a seeded continuation of the same text,
 * written by the worker's `generate`. Text longer than the scene's rail keeps `<bos>` and its
 * last words, and the model reads exactly what the scene shows.
 */
import { promptTokens, type Tokenizer } from "@repo/llm";
import { STACK_TOKENS, type StackRun } from "../../scene/builders/stack.ts";
import type { SceneRunFn } from "../scene-run.ts";

/** The continuation's draw: a fixed seed, so the page reads the same on every visit. */
export const CONTINUATION = { seed: 3, temperature: 0.8, maxNewTokens: 24 } as const;

export const stackRun: SceneRunFn = async (def, text, { model, session }) => {
  const prompt = text ?? def.loop.inputs?.[0] ?? "";
  const tokenizer = model.tokenizer as Tokenizer;
  const all = promptTokens(tokenizer, prompt);
  const ids = all.length > STACK_TOKENS ? [all[0]!, ...all.slice(1 - STACK_TOKENS)] : all;
  const last = ids.length - 1;
  const { trace } = await session.run(ids, { model: "full", trace: { tokens: [last] } });
  const weights = trace!.layers.map((layer) => {
    const { data, shape } = layer!.attn!.weights; // [1, heads, keys]
    const heads = shape[1]!;
    return Array.from({ length: heads }, (_, h) =>
      Array.from(data.subarray(h * ids.length, (h + 1) * ids.length)),
    );
  });
  const arch =
    "manifest" in model && model.manifest.kind === "transformer" ? model.manifest.arch : null;
  if (!arch) throw new Error("the stack chapter needs the full transformer");
  const group = arch.nHeads / arch.nKvHeads;
  const steps = await session.generate(ids, { model: "full", ...CONTINUATION });
  return {
    kind: "stack",
    prompt,
    tokens: ids.map((id) => tokenizer.decode([id])),
    weights,
    kvGroup: Array.from({ length: arch.nHeads }, (_, h) => Math.floor(h / group)),
    continuation: tokenizer.decode(steps.map((s) => s.token)),
    next: tokenizer.decode([steps[0]!.token]),
  } satisfies StackRun;
};
