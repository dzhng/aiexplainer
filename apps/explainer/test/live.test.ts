import { expect, test } from "bun:test";
import { modelMetric } from "@repo/llm";
import { formatStat } from "../src/chapters/format.ts";
import { liveModel } from "../src/hud/live.ts";
import { shippedModel, shippedTokenizer } from "../scripts/shipped.ts";

test("only a transformer is called a language model; the others say what they are", async () => {
  const counts = liveModel(await shippedModel("counts"));
  const tokenizer = liveModel(await shippedTokenizer());
  const rope = liveModel(await shippedModel("rope"));
  expect(counts.what).toContain("word-pair counts model");
  expect(tokenizer.what).toContain("tokenizer");
  for (const line of [counts.what, tokenizer.what]) expect(line).not.toContain("language model");
  expect(rope.what).toContain("tiny language model");
});

test("the receipt's numbers are the model's own, and no time is shown (D27)", async () => {
  const full = await shippedModel("full");
  const { receipt } = liveModel(full);
  expect(receipt).toContain(formatStat(modelMetric(full, "params.total"), "int"));
  expect(receipt).toContain(
    `${full.manifest.kind === "transformer" && full.manifest.arch.nLayers} layers`,
  );
  expect(receipt).not.toMatch(/\d\s*(ms|s)\b|tok\/s/);
  const counts = await shippedModel("counts");
  expect(liveModel(counts).receipt).toContain(formatStat(modelMetric(counts, "vocabSize"), "int"));
});
