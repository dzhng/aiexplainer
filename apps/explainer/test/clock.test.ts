import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { clockFromSearch, heldClock, stepClock, type StepClock } from "../src/runtime/clock.ts";

test("heldClock returns what set gave it", () => {
  const clock = heldClock(2.5);
  expect(clock.now()).toBe(2.5);
  clock.set(12.5);
  expect(clock.now()).toBe(12.5);
});

test("stepClock advances exactly one frame per step", () => {
  const clock = stepClock(30);
  expect(clock.now()).toBe(0);
  for (let i = 0; i < 45; i++) clock.step();
  expect(clock.now()).toBe(45 / 30);
});

test("?clock=held&t= selects a held clock", () => {
  expect(clockFromSearch("?clock=held&t=12.5").now()).toBe(12.5);
});

test("?clock=step&fps= selects a step clock (the recorder)", () => {
  const clock = clockFromSearch("?clock=step&fps=30") as StepClock;
  expect(clock.now()).toBe(0);
  clock.step();
  expect(clock.now()).toBe(1 / 30);
});

test("only clock.ts reads the wall clock", async () => {
  const repo = path.resolve(import.meta.dirname, "../../..");
  const allowed = path.join(repo, "apps/explainer/src/runtime/clock.ts");
  const offenders: string[] = [];
  for (const dir of ["apps/explainer/src", "packages"]) {
    for (const entry of await readdir(path.join(repo, dir), { recursive: true })) {
      const file = path.join(repo, dir, entry);
      if (!/\.(ts|tsx)$/.test(file) || file.includes("node_modules") || file === allowed) continue;
      if (/performance\.now|Date\.now/.test(await readFile(file, "utf8"))) offenders.push(entry);
    }
  }
  expect(offenders).toEqual([]);
});
