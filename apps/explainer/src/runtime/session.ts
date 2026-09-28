// The inference session (D38): a Web Worker running packages/llm, so a typed prompt
// never blocks the controls. Every request names the model it runs on. One request is
// live at a time: a new request, or `cancel()`, rejects the previous one with
// `CancelledError`, and the worker's late reply to it is dropped. (The worker stops a
// cancelled generation at its next token; anything else finishes and is ignored.)
// `sessionScope` ties a run's requests to its lifetime: once it ends, nothing it still
// awaits can reach the worker again.
import type {
  ForwardOptions,
  ForwardResult,
  GenerateStep,
  ModelId,
  ModelManifest,
  Neighbour,
  NextWord,
  ProbeResult,
  TransformerArch,
  SpeculativeResult,
  WeightSlice,
} from "@repo/llm";
import { modelManifestUrl } from "./models.ts";

export interface ModelInfo {
  id: string;
  kind: ModelManifest["kind"];
  arch?: TransformerArch;
  evidence: ProbeResult[];
}

/** A model the session has loaded, by its manifest id (a shipped model's, or a lab fixture's). */
export type HeldId = ModelManifest["id"];

/** A forward pass's options, on `model` (any model this session loaded earlier). */
export type RunOptions = Pick<ForwardOptions, "trace" | "window" | "mlpOff"> & { model: HeldId };

/** A seeded generation (`generate` in @repo/llm) on `model`. */
export interface GenerateRequest {
  model: HeldId;
  seed: number;
  temperature: number;
  maxNewTokens: number;
  /** Without a cache every step rereads the whole text (chapter 9); default true. */
  cache?: boolean;
  window?: number;
}

/** Seeded speculative decoding: `drafter` guesses `k` tokens a round, `target` checks them. */
export interface SpeculateRequest {
  target: HeldId;
  drafter: HeldId;
  k: number;
  maxNewTokens: number;
  temperature: number;
  seed: number;
}

export type WorkerRequest = { id: number } & (
  | { type: "load"; manifestUrl: string }
  | { type: "generate"; tokens: number[]; options: GenerateRequest }
  | { type: "cancel"; target: number }
  | { type: "run"; tokens: number[]; options: RunOptions }
  | { type: "nextWords"; model: HeldId; word: string; k: number }
  | { type: "neighbours"; model: HeldId; token: number; k: number }
  | { type: "weights"; tensor: string; start: number; count: number; model: HeldId }
  | { type: "speculate"; tokens: number[]; options: SpeculateRequest }
);

export type WorkerReply = { id: number } & (
  | { ok: true; result: unknown }
  | { ok: false; error: string }
);

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

export interface Session {
  /** Loads a shipped model by id, or any manifest by URL (lab fixtures), once. */
  load(model: ModelId | URL): Promise<ModelInfo>;
  run(tokens: number[], options: RunOptions): Promise<ForwardResult>;
  /**
   * Writes up to `maxNewTokens` after `tokens`. The worker pauses between tokens, so `cancel()`
   * (or a newer request) stops a long generation part-way, not just its reply.
   */
  generate(tokens: number[], options: GenerateRequest): Promise<GenerateStep[]>;
  nextWords(model: HeldId, word: string, k: number): Promise<NextWord[]>;
  /** A loaded transformer's nearest tokens in its input embedding table. */
  neighbours(model: HeldId, token: number, k: number): Promise<Neighbour[]>;
  /** Speculative decoding on two loaded models (`speculate`), round by round. */
  speculate(tokens: number[], options: SpeculateRequest): Promise<SpeculativeResult>;
  /** A run of a loaded model's stored weights (`weightSlice`). */
  weights(tensor: string, start: number, count: number, model: HeldId): Promise<WeightSlice>;
  /** Rejects the live request, if any, and drops its eventual reply. */
  cancel(): void;
  dispose(): void;
}

export interface SessionOptions {
  /** Where `<id>/manifest.json` lives; defaults to the app's `/models/`. */
  modelsUrl?: URL;
  worker?: Worker;
}

export function createSession(options: SessionOptions = {}): Session {
  const worker =
    options.worker ??
    new Worker(new URL("./session.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<
    number,
    { resolve: (value: never) => void; reject: (e: Error) => void }
  >();
  let nextId = 0;
  /** The live request, and whether the worker can stop it part-way (a generation). */
  let live: { id: number; stoppable: boolean } | undefined;

  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    const request = pending.get(data.id);
    if (!request) return; // cancelled or superseded: a stale reply
    pending.delete(data.id);
    if (live?.id === data.id) live = undefined;
    if (data.ok) request.resolve(data.result as never);
    else request.reject(new Error(data.error));
  };

  const send = <T>(message: WorkerRequest): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      pending.set(message.id, { resolve: resolve as (value: never) => void, reject });
      worker.postMessage(message);
    });

  const cancel = () => {
    if (live === undefined) return;
    // A generation still running stops at its next token; anything else just loses its reply.
    if (live.stoppable)
      worker.postMessage({ id: nextId++, type: "cancel", target: live.id } satisfies WorkerRequest);
    pending.get(live.id)?.reject(new CancelledError());
    pending.delete(live.id);
    live = undefined;
  };

  /** A request that supersedes the live one. */
  const exclusive = <T>(request: WorkerRequest): Promise<T> => {
    cancel();
    live = { id: request.id, stoppable: request.type === "generate" };
    return send<T>(request);
  };

  return {
    load(model) {
      const manifestUrl = model instanceof URL ? model : modelManifestUrl(model, options.modelsUrl);
      cancel();
      return send<ModelInfo>({ id: nextId++, type: "load", manifestUrl: manifestUrl.href });
    },
    run(tokens, options) {
      return exclusive<ForwardResult>({ id: nextId++, type: "run", tokens, options });
    },
    generate(tokens, generation) {
      return exclusive<GenerateStep[]>({
        id: nextId++,
        type: "generate",
        tokens,
        options: generation,
      });
    },
    nextWords(model, word, k) {
      return exclusive<NextWord[]>({ id: nextId++, type: "nextWords", model, word, k });
    },
    neighbours(model, token, k) {
      return send<Neighbour[]>({ id: nextId++, type: "neighbours", model, token, k });
    },
    speculate(tokens, options) {
      return exclusive<SpeculativeResult>({ id: nextId++, type: "speculate", tokens, options });
    },
    weights(tensor, start, count, model) {
      return send<WeightSlice>({ id: nextId++, type: "weights", tensor, start, count, model });
    },
    cancel,
    dispose() {
      cancel();
      for (const request of pending.values()) request.reject(new CancelledError());
      pending.clear();
      worker.terminate();
    },
  };
}

/** The requests a scene run may make (`RunContext.session`). */
export type RunSession = Pick<
  Session,
  "load" | "run" | "generate" | "nextWords" | "weights" | "speculate"
>;

/**
 * One run's view of the session, for as long as the run is current. After `end()` every call,
 * and every reply still on its way, rejects with `CancelledError`: a superseded run's async
 * continuations stop instead of reaching the worker, and its live request is cancelled. A
 * later run's requests are never touched.
 */
export function sessionScope(session: Session): { session: RunSession; end(): void } {
  let ended = false;
  let waiting = 0;
  const guard =
    <A extends unknown[], T>(call: (...args: A) => Promise<T>) =>
    async (...args: A): Promise<T> => {
      if (ended) throw new CancelledError();
      waiting++;
      try {
        const result = await call(...args);
        if (ended) throw new CancelledError();
        return result;
      } finally {
        waiting--;
      }
    };
  return {
    session: {
      load: guard(session.load),
      run: guard(session.run),
      generate: guard(session.generate),
      nextWords: guard(session.nextWords),
      weights: guard(session.weights),
      speculate: guard(session.speculate),
    },
    end() {
      if (ended) return;
      ended = true;
      // Whatever is live is this run's: runs never overlap, and the next starts after this ends.
      if (waiting > 0) session.cancel();
    },
  };
}
