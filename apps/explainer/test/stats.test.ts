import { expect, test } from "bun:test";
import { shipped, shippedModel } from "../scripts/shipped.ts";
import { CHAPTERS } from "../src/chapters/index.ts";
import { formatStat } from "../src/chapters/format.ts";
import { resolveStat, statSource, statText } from "../src/chapters/stats.ts";
import { countUpText } from "../src/hud/motion.ts";

test("every written chapter's stats resolve against its shipped model, with a source line", async () => {
  for (const def of Object.values(CHAPTERS)) {
    const model = def.model === null ? null : await shipped(def.model);
    for (const stat of def.stats) {
      expect(Number.isFinite(resolveStat(stat, model))).toBe(true);
      expect(statSource(stat, model)).not.toBe("");
    }
  }
});

test("chapter 0's chips show the counts model's own numbers", async () => {
  const model = await shippedModel("counts");
  const [words, vocab, top] = CHAPTERS.autocomplete!.stats;
  expect(resolveStat(words, model)).toBe(model.manifest.training!.tokensSeen);
  expect(resolveStat(vocab, model)).toBe(model.tensors.get("vocab")!.shape[0]!);
  expect(resolveStat(top, model)).toBe(
    model.manifest.evidence.find((e) => e.probe === "top-successor")!.value,
  );
  expect(statText(words, model)).toMatch(/ million$/);
});

test("a chip's count-up starts at zero and settles on exactly the chip's text", async () => {
  const model = await shipped("counts");
  for (const stat of CHAPTERS.autocomplete!.stats) {
    const value = resolveStat(stat, model);
    expect(countUpText(value, stat.format, 0)).toBe(formatStat(0, stat.format));
    expect(countUpText(value, stat.format, 1)).toBe(statText(stat, model));
    expect(countUpText(value, stat.format, 1.7)).toBe(statText(stat, model));
  }
});

test("a model-backed stat without a loaded model throws instead of showing a made-up number", () => {
  const [words] = CHAPTERS.autocomplete!.stats;
  expect(() => resolveStat(words, null)).toThrow("none is loaded");
});
