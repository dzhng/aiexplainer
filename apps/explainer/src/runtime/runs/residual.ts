/**
 * Chapter 7's run: the same text through both 4-layer models, `noresidual` (each station's
 * output replaces the signal) and `residual` (each station adds to a river, with RMSNorm).
 * Everything is read off one traced forward pass each, at the last token:
 * - the stream's size (RMS) entering each layer and leaving the last (`residualIn`, `sum`);
 * - what each station computes (the RMS of its attention and MLP outputs together);
 * - the model's best next word and its probability.
 * Every run names its model, so it never depends on which model the session loaded last.
 */
import { probabilities, promptTokens, type ModelId, type Tokenizer } from "@repo/llm";
import type { ResidualPass, ResidualRun } from "../../scene/builders/residual.ts";
import type { RunContext, SceneRunFn } from "../scene-run.ts";

const rms = (values: ArrayLike<number>) => {
  let squares = 0;
  for (let i = 0; i < values.length; i++) squares += values[i]! ** 2;
  return Math.sqrt(squares / values.length);
};

async function pass(
  session: RunContext["session"],
  model: ModelId,
  tokens: number[],
  tokenizer: Tokenizer,
): Promise<ResidualPass> {
  await session.load(model);
  const last = tokens.length - 1;
  const { logits, trace } = await session.run(tokens, { model, trace: { tokens: [last] } });
  const layers = trace!.layers.map((layer) => layer!);
  const stream = [
    ...layers.map((layer) => layer.attn!.residual.rms.data[0]!),
    rms(layers.at(-1)!.mlpResidual!.sum.data),
  ];
  const adds = layers.map((layer) => {
    const attn = layer.attn!.residual.branch.data;
    const mlp = layer.mlpResidual!.branch.data;
    return rms(attn.map((v, i) => v + mlp[i]!));
  });
  const probs = probabilities(logits, 1);
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i]! > probs[best]!) best = i;
  return {
    model,
    stream,
    adds,
    answer: tokenizer.decode([best]),
    p: probs[best]!,
    vocab: probs.length,
  };
}

export const residualRun: SceneRunFn = async (def, text, { model, session }) => {
  const prompt = text ?? def.loop.inputs?.[0] ?? "";
  const tokenizer = model.tokenizer as Tokenizer;
  const tokens = promptTokens(tokenizer, prompt);
  const run: ResidualRun = {
    kind: "residual",
    prompt,
    without: await pass(session, "noresidual", tokens, tokenizer),
    // The chapter's own model last, so the session ends where the app expects it.
    with: await pass(session, "residual", tokens, tokenizer),
  };
  return run;
};
