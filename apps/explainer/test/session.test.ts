import { afterAll, describe, expect, test } from "bun:test";
import { fetchModel, forward, transformerModel } from "@repo/llm";
import { CancelledError, createSession } from "../src/runtime/session.ts";

const repo = new URL("../../../", import.meta.url);
const fixture = new URL("training/fixtures/parity/gqa/manifest.json", repo);
const session = createSession({ modelsUrl: new URL("apps/explainer/public/models/", repo) });
afterAll(() => session.dispose());

// Bun's `expect(promise).rejects` does not pump worker messages while it waits, so
// rejections are awaited as plain promises.
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: Error) => error,
  );

const promptA = [0, 431, 440, 260, 399, 13, 402, 284, 260, 391];
const promptB = [0, 12, 99, 7];
const promptC = [0, 431, 440, 260];

describe("inference session (worker)", () => {
  test("runs a transformer off the main thread with the same logits", async () => {
    const info = await session.load(fixture);
    expect(info.kind).toBe("transformer");
    const direct = forward(transformerModel(await fetchModel(fixture)), promptC).logits;
    const { logits, trace } = await session.run(promptC, { layers: [0] });
    expect(Array.from(logits)).toEqual(Array.from(direct));
    expect(trace?.layers[1]).toBeNull();
  });

  test("cancel rejects the live request and its late result is dropped", async () => {
    await session.load(fixture);
    const a = session.run(promptA, {});
    session.cancel();
    expect(await rejection(a)).toBeInstanceOf(CancelledError);

    const b = session.run(promptB);
    const c = session.run(promptC);
    expect(await rejection(b)).toBeInstanceOf(CancelledError);
    const direct = forward(transformerModel(await fetchModel(fixture)), promptC).logits;
    expect(Array.from((await c).logits)).toEqual(Array.from(direct));
  });

  test("answers chapter 0's word queries from the counts model", async () => {
    const info = await session.load("counts");
    expect(info.evidence.length).toBeGreaterThan(0);
    const [top] = await session.nextWords("once", 1);
    expect(top?.word).toBe("upon");
  });

  test("errors come back as rejections", async () => {
    await session.load("counts");
    expect((await rejection(session.run([1, 2])))?.message).toContain("needs a loaded transformer");
  });
});
