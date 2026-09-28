import { expect, test } from "bun:test";
import { copyOrShow } from "../src/fallback/copy.ts";

const url = "https://example.test/c/13/";

test("copies the link when the clipboard takes it", async () => {
  const written: string[] = [];
  const shown: string[] = [];
  const clipboard = { writeText: async (t: string) => void written.push(t) };
  expect(await copyOrShow(url, clipboard, (t) => shown.push(t))).toBe(true);
  expect(written).toEqual([url]);
  expect(shown).toEqual([]);
});

test("shows the link instead when there is no clipboard, or it refuses or throws", async () => {
  const refusing = { writeText: () => Promise.reject(new Error("denied")) };
  const throwing = {
    writeText: (): Promise<void> => {
      throw new TypeError("not allowed");
    },
  };
  for (const clipboard of [undefined, refusing, throwing]) {
    const shown: string[] = [];
    expect(await copyOrShow(url, clipboard, (t) => shown.push(t))).toBe(false);
    expect(shown).toEqual([url]);
  }
});
