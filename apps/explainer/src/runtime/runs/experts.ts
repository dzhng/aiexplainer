/**
 * Chapter 14's run: one forward pass of the `moe` model on the text, tracing the router of
 * `ROUTER_LAYER`, for the first `ROUTED_TOKENS` tokens (after `<bos>`): each token's two chosen
 * experts and their renormalised weights. The usage histogram is the model's export-gate
 * evidence (`expert-usage-<e>`), read from its manifest.
 */
import { probeResult, promptTokens, sourceEvidence } from "@repo/llm";
import { ROUTED_TOKENS, ROUTER_LAYER } from "../../chapters/data/experts.ts";
import type { SceneRunFn } from "../scene-run.ts";

export const expertsRun: SceneRunFn = async (def, text, { model, session }) => {
  if (!("manifest" in model) || model.manifest.kind !== "transformer" || !model.tokenizer)
    throw new Error("experts needs the moe model and its tokenizer");
  const { tokenizer } = model;
  const arch = model.manifest.arch;
  if (arch.mlp === "none" || arch.mlp.kind !== "moe") throw new Error("experts needs an MoE model");
  const prompt = text ?? def.loop.inputs?.[0] ?? "";
  const ids = promptTokens(tokenizer, prompt);
  // Position 0 is <bos>; the desk sees the words after it.
  const shown = Array.from({ length: Math.min(ROUTED_TOKENS, ids.length - 1) }, (_, i) => i + 1);
  await session.load("moe");
  const { trace } = await session.run(ids, {
    model: "moe",
    trace: { tokens: shown, layers: [ROUTER_LAYER] },
  });
  const router = trace?.layers[ROUTER_LAYER]?.router;
  if (!router) throw new Error("the moe trace has no router record");
  const k = arch.mlp.topK;
  const evidence = sourceEvidence(model);
  return {
    kind: "experts",
    prompt,
    layer: ROUTER_LAYER,
    layers: arch.nLayers,
    experts: arch.mlp.experts,
    tokens: shown.map((id, row) => ({
      text: tokenizer.decode([ids[id]!]),
      experts: Array.from(router.experts.data.subarray(row * k, (row + 1) * k)),
      weights: Array.from(router.weights.data.subarray(row * k, (row + 1) * k)),
    })),
    usage: Array.from(
      { length: arch.mlp.experts },
      (_, e) => probeResult(evidence, `expert-usage-${e}`).value,
    ),
  };
};
