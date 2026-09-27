import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { autocomplete } from "../src/chapters/data/autocomplete.ts";
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
  expect(LADDER).toHaveLength(16);
  expect(displayNumber("autocomplete")).toBe(0);
  expect(displayNumber("finished")).toBe(15);
  expect(slugAt(4)).toBe("attention");
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

test("rejects a story sentence over 25 words and a missing precisely line", () => {
  const long = broken(
    (d) => void (d.caption.byFollow.next!.story[0] = Array(26).fill("word").join(" ") + "."),
  );
  expect(validateChapter(long)).toContain(
    "caption.byFollow.next: sentence 1 has 26 words (max 25)",
  );
  const noPrecisely = broken((d) => void (d.caption.default.precisely = ""));
  expect(validateChapter(noPrecisely)).toContain("caption: missing precisely line");
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
