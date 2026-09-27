import { expect, test } from "bun:test";
import { fetchModel, type LoadedModel, type ModelId } from "@repo/llm";
import { CHAPTERS } from "../src/chapters/index.ts";
import { resolveStat, statSource, statText } from "../src/chapters/stats.ts";

const shipped = (id: ModelId): Promise<LoadedModel> =>
  fetchModel(new URL(`../public/models/${id}/manifest.json`, import.meta.url));

test("every written chapter's stats resolve against its shipped model, with a source line", async () => {
  for (const def of Object.values(CHAPTERS)) {
    const model = def.model === null ? null : await shipped(def.model);
    for (const stat of def.stats) {
      expect(Number.isFinite(resolveStat(stat, model, def.slider.initial))).toBe(true);
      expect(statSource(stat, model)).not.toBe("");
    }
  }
});

test("chapter 0's chips show the counts model's own numbers", async () => {
  const model = await shipped("counts");
  const [words, vocab, top] = CHAPTERS.autocomplete!.stats;
  expect(resolveStat(words, model)).toBe(model.manifest.training!.tokensSeen);
  expect(resolveStat(vocab, model)).toBe(model.tensors.get("vocab")!.shape[0]!);
  expect(resolveStat(top, model)).toBe(
    model.manifest.evidence.find((e) => e.probe === "top-successor")!.value,
  );
  expect(statText(words, model)).toMatch(/ million$/);
});

test("a model-backed stat without a loaded model throws instead of showing a made-up number", () => {
  const [words] = CHAPTERS.autocomplete!.stats;
  expect(() => resolveStat(words, null)).toThrow("none is loaded");
});
