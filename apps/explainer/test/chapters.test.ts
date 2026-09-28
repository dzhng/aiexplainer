import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { autocomplete } from "../src/chapters/data/autocomplete.ts";
import { formatStat } from "../src/chapters/format.ts";
import { CHAPTERS } from "../src/chapters/index.ts";
import { LADDER, displayNumber, slugAt } from "../src/chapters/ladder.ts";
import type { ChapterDef } from "../src/chapters/types.ts";
import { validateChapter } from "../src/chapters/validate.ts";

/** A valid chapter with one field broken; the cast is how a fixture breaks the types on purpose. */
const broken = (patch: (def: ChapterDef) => void): ChapterDef => {
  const def = structuredClone(autocomplete);
  patch(def);
  return def;
};

test("every chapter in the ladder that has been written validates", () => {
  for (const slug of LADDER) {
    const def = CHAPTERS[slug];
    if (def) expect({ slug, problems: validateChapter(def) }).toEqual({ slug, problems: [] });
  }
});

test("every file in chapters/data is registered under its slug", async () => {
  const dir = path.resolve(import.meta.dirname, "../src/chapters/data");
  const slugs = (await readdir(dir)).map((f) => f.replace(/\.ts$/, "")).sort();
  expect(slugs).toEqual(Object.keys(CHAPTERS).sort());
});

test("the display number is the ladder index (D31)", () => {
  LADDER.forEach((slug, i) => {
    expect(displayNumber(slug)).toBe(i);
    expect(slugAt(i)).toBe(slug);
  });
});

test("rejects a 35-second loop", () => {
  const problems = validateChapter(broken((d) => void (d.loop.durationSec = 35)));
  expect(problems.some((p) => p.includes("outside 20–30 s"))).toBe(true);
});

test("rejects a 3-sentence caption, whether as three entries or packed into one", () => {
  const threeEntries = broken((d) => {
    (d.caption.default.story as string[]).push("A third sentence.");
  });
  expect(validateChapter(threeEntries)).toContain("caption: story must be exactly 2 sentences");
  const packed = broken((d) => {
    d.caption.default.story[1] = "One sentence here. And another one after it.";
  });
  expect(validateChapter(packed)).toContain("caption: sentence 2 holds more than one sentence");
});

test("rejects a story sentence over 25 words and a missing technical line", () => {
  const long = broken(
    (d) => void (d.caption.byFollow.next!.story[0] = Array(26).fill("word").join(" ") + "."),
  );
  expect(validateChapter(long)).toContain(
    "caption.byFollow.next: sentence 1 has 26 words (max 25)",
  );
  const noTechnical = broken((d) => void (d.caption.default.technical = ""));
  expect(validateChapter(noTechnical)).toContain("caption: missing technical line");
});

test("rejects a stat with no scale", () => {
  const def = broken((d) => void delete (d.stats[1] as Partial<ChapterDef["stats"][1]>).scale);
  expect(validateChapter(def)).toContain("stat distinct-words: missing or unknown scale");
});

test("rejects an unknown anchor, shot or colour token", () => {
  const anchor = broken((d) => void (d.labels[0]!.anchor = "gearbox" as never));
  expect(validateChapter(anchor)).toContain("label: unknown anchor gearbox");
  const shot = broken((d) => void (d.shot = "nowhere" as never));
  expect(validateChapter(shot)).toContain("unknown shot nowhere");
  const tint = broken((d) => void (d.loop.beats[0]!.tint = "chartreuse" as never));
  expect(validateChapter(tint)).toContain("beat word-lands: unknown colour token chartreuse");
});

test("rejects a scene built from a primitive outside the kit, or an unknown scene", () => {
  const def = broken(() => {});
  expect(validateChapter(def, () => ["mesh", "hologram"])).toContain(
    "unknown kit primitive hologram",
  );
  expect(validateChapter(def, () => ["mesh", "bars", "block", "tube"])).toEqual([]);
  expect(validateChapter(def, () => undefined)).toContain("unknown scene autocomplete");
});

test("rejects more than 3 follow targets and more than 5 labels", () => {
  const follow = broken(
    (d) => void d.follow.push({ id: "extra", label: "Extra", anchor: "board" }),
  );
  expect(validateChapter(follow)).toContain("4 follow targets (max 3)");
  const labels = broken((d) => {
    while (d.labels.length < 6) d.labels.push({ ...d.labels[0]! });
  });
  expect(validateChapter(labels)).toContain("6 labels (max 5)");
});

describe("arith stats resolve through the registry", () => {
  type Chip = ChapterDef["stats"][0];
  const withArith = (value: Chip["value"], patch: Partial<Chip> = {}) =>
    broken((d) => {
      d.stats[0] = {
        id: "kv",
        label: "KV cache per token",
        format: "bytes",
        scale: "Llama-3-8B",
        value,
        ...patch,
      };
    });
  const kv: Chip["value"] = { kind: "arith", fn: "kvBytesPerToken", args: { kvBytes: 2 } };

  test("a registered function at its own scale and unit validates", () => {
    expect(validateChapter(withArith(kv))).toEqual([]);
  });

  test("rejects an unknown function, a missing argument, and a mismatched scale or format", () => {
    const unknown = withArith({ kind: "arith", fn: "vibes" as never, args: {} });
    expect(validateChapter(unknown)).toContain("stat kv: unknown arithmetic function vibes");
    const missing = withArith({ kind: "arith", fn: "kvBytesPerToken", args: {} });
    expect(validateChapter(missing)).toContain(
      "stat kv: kvBytesPerToken: missing argument kvBytes",
    );
    const scale = withArith(kv, { scale: "this tiny model" });
    expect(validateChapter(scale)).toContain(
      'stat kv: kvBytesPerToken is at scale "Llama-3-8B", not "this tiny model"',
    );
    const format = withArith(kv, { format: "tok/s" });
    expect(validateChapter(format)).toContain(
      "stat kv: kvBytesPerToken gives bytes, which format tok/s can't show",
    );
  });
});

test("stat formatting names units and keeps three significant figures", () => {
  expect(formatStat(131_072, "bytes")).toBe("131 kB");
  expect(formatStat(16_060_522_496, "bytes")).toBe("16.1 GB");
  expect(formatStat(8_030_261_248, "int")).toBe("8.03 billion");
  expect(formatStat(14_336, "int")).toBe("14,336");
  expect(formatStat(208.37, "tok/s")).toBe("208 tok/s");
  expect(formatStat(0.0322, "s")).toBe("32.2 ms");
  expect(formatStat(0.623, "pct")).toBe("62.3%");
  expect(formatStat(0.9991, "pct")).toBe("99.9%");
  expect(formatStat(3.3616, "x")).toBe("3.36×");
  expect(formatStat(0.00024573, "num")).toBe("0.000246");
  expect(formatStat(4.2178, "num")).toBe("4.22");
});
