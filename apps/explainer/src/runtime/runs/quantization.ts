/**
 * Chapter 12's run: both machines continue the same text greedily (`generate` at temperature
 * 0, on `full` and on `full-q8`), and the strip reads one q8_0 group of both models' stored
 * weights. The crate's ratio is the `full-q8` model's measured `q8-bytes` probe. Every request
 * names its model, so it never depends on which model the session loaded last.
 */
import { probeResult, promptTokens, sourceEvidence, type ModelId } from "@repo/llm";
import { CONTINUE_WORDS, STRIP } from "../../chapters/data/quantization.ts";
import { promptOf, transformerOf, type SceneRunFn } from "../scene-run.ts";

export const quantizationRun: SceneRunFn = async (def, text, { model, session }) => {
  const { tokenizer } = transformerOf(model, "quantization");
  const prompt = promptOf(def, text);
  const tokens = promptTokens(tokenizer, prompt);
  const continued = async (id: ModelId) => {
    await session.load(id);
    const steps = await session.generate(tokens, {
      model: id,
      seed: 0,
      temperature: 0,
      maxNewTokens: CONTINUE_WORDS,
    });
    return steps.map((s) => tokenizer.decode([s.token]));
  };
  const full = await continued("full");
  const q8 = await continued("full-q8");
  const f16 = await session.weights(STRIP.tensor, STRIP.start, STRIP.count, "full");
  const int8 = await session.weights(STRIP.tensor, STRIP.start, STRIP.count, "full-q8");
  if (!int8.q8) throw new Error(`full-q8's ${STRIP.tensor} is not q8_0`);
  return {
    kind: "quantization",
    prompt,
    full,
    q8,
    strip: { ...STRIP, full: f16.values, q8: int8.values, ...int8.q8 },
    byteRatio: probeResult(sourceEvidence(model), "q8-bytes").value,
  };
};
