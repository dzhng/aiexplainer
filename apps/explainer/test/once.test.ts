import { expect, test } from "bun:test";
import { onceUntilFailure } from "../src/runtime/once.ts";

test("callers of one key share a single load", async () => {
  let calls = 0;
  const get = onceUntilFailure(async (key: string) => `${key}#${++calls}`);
  expect(await Promise.all([get("a"), get("a")])).toEqual(["a#1", "a#1"]);
  expect(await get("a")).toBe("a#1");
  expect(await get("b")).toBe("b#2");
});

test("a failed load is retried on the next call, then kept once it succeeds", async () => {
  let calls = 0;
  const get = onceUntilFailure(async (key: string) => {
    calls++;
    if (calls === 1) throw new Error("network blip");
    return `${key} loaded`;
  });
  await expect(get("full")).rejects.toThrow("network blip");
  expect(await get("full")).toBe("full loaded");
  expect(await get("full")).toBe("full loaded");
  expect(calls).toBe(2);
});
