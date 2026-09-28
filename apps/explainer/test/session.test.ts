import { afterAll, describe, expect, test } from "bun:test";
import { fetchModel, forward, generate, seededRng, transformerModel } from "@repo/llm";
import { stopFlags } from "../src/runtime/inference.ts";
import {
  CancelledError,
  createSession,
  sessionScope,
  type Session,
  type WorkerRequest,
} from "../src/runtime/session.ts";

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
    const { logits, trace } = await session.run(promptC, {
      model: info.id,
      trace: { layers: [0] },
    });
    expect(Array.from(logits)).toEqual(Array.from(direct));
    expect(trace?.layers[1]).toBeNull();
  });

  test("cancel rejects the live request and its late result is dropped", async () => {
    const { id: model } = await session.load(fixture);
    const a = session.run(promptA, { model, trace: {} });
    session.cancel();
    expect(await rejection(a)).toBeInstanceOf(CancelledError);

    const b = session.run(promptB, { model });
    const c = session.run(promptC, { model });
    expect(await rejection(b)).toBeInstanceOf(CancelledError);
    const direct = forward(transformerModel(await fetchModel(fixture)), promptC).logits;
    expect(Array.from((await c).logits)).toEqual(Array.from(direct));
  });

  test("answers chapter 0's word queries from the counts model", async () => {
    const info = await session.load("counts");
    expect(info.evidence.length).toBeGreaterThan(0);
    const [top] = await session.nextWords("counts", "once", 1);
    expect(top?.word).toBe("upon");
  });

  test("a request runs on the model it names, whatever was loaded after it", async () => {
    const info = await session.load(fixture);
    await session.load("counts");
    const direct = forward(transformerModel(await fetchModel(fixture)), promptC).logits;
    const named = await session.run(promptC, { model: info.id });
    expect(Array.from(named.logits)).toEqual(Array.from(direct));
    // Loading again answers with the model already held.
    expect(await session.load(fixture)).toEqual(info);
  });

  test("generates the seeded tokens the llm package does, and cancel stops a generation", async () => {
    const { id: model } = await session.load(fixture);
    const draw = { model, seed: 3, temperature: 0.8 };
    const direct = [
      ...generate(transformerModel(await fetchModel(fixture)), promptC, {
        maxNewTokens: 6,
        temperature: 0.8,
        rng: seededRng(3),
      }),
    ];
    const steps = await session.generate(promptC, { ...draw, maxNewTokens: 6 });
    expect(steps).toEqual(direct);
    const long = session.generate(promptC, { ...draw, maxNewTokens: 200 });
    session.cancel();
    expect(await rejection(long)).toBeInstanceOf(CancelledError);
    // The worker stopped part-way, so the next request is answered at once.
    const after = await session.generate(promptC, { ...draw, maxNewTokens: 6 });
    expect(after).toEqual(direct);
  });

  test("reads a named model's stored weights: f16 as stored, q8_0 with its scale and ints", async () => {
    await session.load("full");
    await session.load("full-q8");
    const f16 = await session.weights("layers.0.attn.wq", 0, 32, "full");
    const int8 = await session.weights("layers.0.attn.wq", 0, 32, "full-q8");
    expect(f16.q8).toBeUndefined();
    expect(int8.q8!.q.map((q) => q * int8.q8!.scale)).toEqual(int8.values);
    int8.values.forEach((v, i) =>
      expect(Math.abs(v - f16.values[i]!)).toBeLessThanOrEqual(int8.q8!.scale / 2 + 1e-4),
    );
  });

  test("errors come back as rejections", async () => {
    await session.load("counts");
    expect((await rejection(session.run([1, 2], { model: "counts" })))?.message).toContain(
      "needs a loaded transformer",
    );
  });
});

/** A worker stand-in that records what it is sent and never replies. */
function silentWorker() {
  const sent: WorkerRequest[] = [];
  const worker = {
    onmessage: null,
    postMessage: (message: WorkerRequest) => sent.push(message),
    terminate() {},
  } as unknown as Worker;
  return { sent, session: createSession({ worker }) };
}

describe("cancellation leaves nothing behind", () => {
  test("only a generation is told to stop; any other cancelled request just loses its reply", () => {
    const { sent, session } = silentWorker();
    void rejection(session.run([0, 1], { model: "full" }));
    session.cancel();
    void rejection(
      session.generate([0, 1], { model: "full", seed: 0, temperature: 0, maxNewTokens: 4 }),
    );
    session.cancel();
    session.cancel();
    expect(
      sent.filter((m) => m.type === "cancel").map((m) => m.type === "cancel" && m.target),
    ).toEqual([sent.find((m) => m.type === "generate")!.id]);
    session.dispose();
  });

  test("the worker holds a stop flag only while its request runs", async () => {
    const stops = stopFlags();
    stops.stop(7); // unknown: ignored
    let release = () => {};
    let check = () => false;
    const running = stops.during(1, (stopped) => {
      check = stopped;
      return new Promise<string>((resolve) => (release = () => resolve("done")));
    });
    expect(stops.size).toBe(1);
    stops.stop(1);
    expect(check()).toBe(true);
    release();
    expect(await running).toBe("done");
    expect(stops.size).toBe(0);
    stops.stop(1); // finished: ignored
    expect(stops.size).toBe(0);
    await stops.during(2, async (stopped) => expect(stopped()).toBe(false));
  });
});

describe("a run's scope (sessionScope)", () => {
  /** A session whose replies the test releases by hand, recording every request made. */
  function manualSession() {
    const calls: string[] = [];
    const replies: (() => void)[] = [];
    let cancels = 0;
    const later = <T>(name: string, value: T) => {
      calls.push(name);
      return new Promise<T>((resolve) => replies.push(() => resolve(value)));
    };
    const session = {
      load: (id: unknown) => later(`load ${String(id)}`, { id: String(id) }),
      run: (_: number[], o: { model: string }) => later(`run ${o.model}`, {}),
      generate: (_: number[], o: { model: string }) => later(`generate ${o.model}`, []),
      nextWords: (model: string) => later(`nextWords ${model}`, []),
      weights: (_t: string, _s: number, _c: number, model: string) => later(`weights ${model}`, {}),
      speculate: (_: number[], o: { target: string }) => later(`speculate ${o.target}`, {}),
      cancel: () => cancels++,
    } as unknown as Session;
    return { session, calls, replies, cancels: () => cancels };
  }

  test("a superseded run's late continuation never reaches the session", async () => {
    const { session, calls, replies, cancels } = manualSession();
    const old = sessionScope(session);
    // The old chapter's run: load its model, then run it.
    const oldRun = (async () => {
      await old.session.load("attn");
      await old.session.run([0], { model: "attn" });
    })();
    old.end();
    expect(cancels()).toBe(1);
    const next = sessionScope(session);
    const nextRun = next.session.run([0], { model: "mlp" });
    // The old load answers last: the old run stops there instead of sending its request.
    replies[1]!();
    replies[0]!();
    expect(await rejection(oldRun)).toBeInstanceOf(CancelledError);
    await nextRun;
    expect(calls).toEqual(["load attn", "run mlp"]);
    expect(await rejection(old.session.run([0], { model: "attn" }))).toBeInstanceOf(CancelledError);
    expect(cancels()).toBe(1);
  });

  test("ending a run with nothing in flight cancels nothing", async () => {
    const { session, replies, cancels } = manualSession();
    const scope = sessionScope(session);
    const done = scope.session.run([0], { model: "full" });
    replies[0]!();
    await done;
    scope.end();
    expect(cancels()).toBe(0);
  });
});
