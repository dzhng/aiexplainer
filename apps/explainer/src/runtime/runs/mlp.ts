/**
 * Chapter 6's run, all from real forward passes of the `mlp` model on the text:
 * - the lamps: the most active neurons at the last position (|activation|, trace `mlp.act`);
 * - each lamp's push: how much the answer's score (logit) drops with that neuron alone off;
 * - p(answer) with the panel on, and with the top `MLP_OFF` neurons off (the `mlp-neurons`
 *   probe's own edit, so the default prompt reproduces its evidence);
 * - the failure teaser: the `noresidual` model's stream size, layer by layer, on the same text.
 * Every run names its model, so it never depends on which model the session loaded last.
 */
import { probabilities, promptTokens, type Tokenizer } from "@repo/llm";
import { MLP_LAMPS, type MlpRun } from "../../scene/builders/mlp.ts";
import type { RunSession, SceneRunFn } from "../scene-run.ts";

/** Neurons switched off for the readout: the `mlp` probe's `TOP_NEURONS`. */
export const MLP_OFF = 16;

function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

/** The stream's RMS at the last token entering each layer and leaving the last, ÷ the first. */
async function streamFade(session: RunSession, tokens: number[]): Promise<number[]> {
  await session.load("noresidual");
  const last = tokens.length - 1;
  const { trace } = await session.run(tokens, { model: "noresidual", trace: { tokens: [last] } });
  const layers = trace!.layers.map((layer) => layer!);
  const final = layers.at(-1)!.mlpResidual!.sum.data;
  let squares = 0;
  for (const v of final) squares += v * v;
  const sizes = [
    ...layers.map((layer) => layer.attn!.residual.rms.data[0]!),
    Math.sqrt(squares / final.length),
  ];
  return sizes.map((size) => size / sizes[0]!);
}

export const mlpRun: SceneRunFn = async (def, text, session, model) => {
  const prompt = text ?? def.loop.inputs?.[0] ?? "";
  const tokenizer = model.tokenizer as Tokenizer;
  const tokens = promptTokens(tokenizer, prompt);
  const last = tokens.length - 1;
  const on = await session.run(tokens, { model: "mlp", trace: { tokens: [last], layers: [0] } });
  const act = on.trace!.layers[0]!.mlp!.act.data;
  const answer = argmax(on.logits);
  const p = probabilities(on.logits, 1)[answer]!;

  const byActivity = Array.from(act.keys()).sort((a, b) => Math.abs(act[b]!) - Math.abs(act[a]!));
  const top = byActivity.slice(0, MLP_LAMPS);
  const off = await session.run(tokens, {
    model: "mlp",
    mlpOff: { layer: 0, neurons: byActivity.slice(0, MLP_OFF) },
  });
  const lamps: MlpRun["lamps"] = [];
  for (const [rank, neuron] of top.entries()) {
    const without = await session.run(tokens, {
      model: "mlp",
      mlpOff: { layer: 0, neurons: [neuron] },
    });
    lamps.push({
      neuron,
      act: act[neuron]!,
      push: on.logits[answer]! - without.logits[answer]!,
      rank,
    });
  }
  lamps.sort((a, b) => a.neuron - b.neuron);

  return {
    kind: "mlp",
    prompt,
    answer: tokenizer.decode([answer]),
    p,
    pOff: probabilities(off.logits, 1)[answer]!,
    offCount: MLP_OFF,
    lamps,
    fade: await streamFade(session, tokens),
  };
};
