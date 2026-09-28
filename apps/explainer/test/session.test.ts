import { afterAll, describe, expect, test } from "bun:test";
import {
  fetchModel,
  forward,
  generate,
  seededRng,
  transformerModel,
  type ModelId,
} from "@repo/llm";
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
    const { logits, trace } = await session.run(promptC, { trace: { layers: [0] } });
    expect(Array.from(logits)).toEqual(Array.from(direct));
    expect(trace?.layers[1]).toBeNull();
  });

  test("cancel rejects the live request and its late result is dropped", async () => {
    await session.load(fixture);
    const a = session.run(promptA, { trace: {} });
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

  test("a run can name any model loaded earlier, whichever was loaded last", async () => {
    const info = await session.load(fixture);
    await session.load("counts");
    const direct = forward(transformerModel(await fetchModel(fixture)), promptC).logits;
    const named = await session.run(promptC, { model: info.id as ModelId });
    expect(Array.from(named.logits)).toEqual(Array.from(direct));
    expect((await rejection(session.run(promptC)))?.message).toContain(
      "needs a loaded transformer",
    );
  });

  test("generates the seeded tokens the llm package does, and cancel stops a generation", async () => {
    await session.load(fixture);
    const direct = [
      ...generate(transformerModel(await fetchModel(fixture)), promptC, {
        maxNewTokens: 6,
        temperature: 0.8,
        rng: seededRng(3),
      }),
    ];
    const steps = await session.generate(promptC, { seed: 3, temperature: 0.8, maxNewTokens: 6 });
    expect(steps).toEqual(direct);
    const long = session.generate(promptC, { seed: 3, temperature: 0.8, maxNewTokens: 200 });
    session.cancel();
    expect(await rejection(long)).toBeInstanceOf(CancelledError);
    // The worker stopped part-way, so the next request is answered at once.
    const after = await session.generate(promptC, { seed: 3, temperature: 0.8, maxNewTokens: 6 });
    expect(after).toEqual(direct);
  });

  test("errors come back as rejections", async () => {
    await session.load("counts");
    expect((await rejection(session.run([1, 2])))?.message).toContain("needs a loaded transformer");
  });
});
