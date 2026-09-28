// The inference session (D38): a Web Worker running packages/llm, so a typed prompt
// never blocks the controls. One request is live at a time: a new request, or
// `cancel()`, rejects the previous one with `CancelledError`, and the worker's late
// reply to it is dropped. (The worker finishes the stale computation; it is never
// interrupted mid-forward, only ignored.)
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

/**
 * A forward pass's options, on the latest model loaded, or on `model` (any model this session
 * loaded earlier: a chapter that compares two models loads both, then names each).
 */
export type RunOptions = Pick<ForwardOptions, "trace" | "window" | "mlpOff"> & { model?: ModelId };

/** A seeded generation (`generate` in @repo/llm) on the latest model loaded, or on `model`. */
export interface GenerateRequest {
  model?: ModelId;
  seed: number;
  temperature: number;
  maxNewTokens: number;
  /** Without a cache every step rereads the whole text (chapter 9); default true. */
  cache?: boolean;
  window?: number;
}

/** Seeded speculative decoding: `drafter` guesses `k` tokens a round, `target` checks them. */
export interface SpeculateRequest {
  target: ModelId;
  drafter: ModelId;
  k: number;
  maxNewTokens: number;
  temperature: number;
  seed: number;
}

export type WorkerRequest = { id: number } & (
  | { type: "load"; manifestUrl: string }
  | { type: "generate"; tokens: number[]; options: GenerateRequest }
  | { type: "cancel"; target: number }
  | { type: "run"; tokens: number[]; options?: RunOptions }
  | { type: "nextWords"; word: string; k: number }
  | { type: "neighbours"; token: number; k: number }
  | { type: "weights"; tensor: string; start: number; count: number; model?: ModelId }
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
  /** Loads a shipped model by id, or any manifest by URL (lab fixtures), and makes it current. */
  load(model: ModelId | URL): Promise<ModelInfo>;
  run(tokens: number[], options?: RunOptions): Promise<ForwardResult>;
  /**
   * Writes up to `maxNewTokens` after `tokens`. The worker pauses between tokens, so `cancel()`
   * (or a newer request) stops a long generation part-way, not just its reply.
   */
  generate(tokens: number[], options: GenerateRequest): Promise<GenerateStep[]>;
  nextWords(word: string, k: number): Promise<NextWord[]>;
  /** The loaded transformer's nearest tokens in its input embedding table. */
  neighbours(token: number, k: number): Promise<Neighbour[]>;
  /** Speculative decoding on two loaded models (`speculate`), round by round. */
  speculate(tokens: number[], options: SpeculateRequest): Promise<SpeculativeResult>;
  /** A run of a loaded model's stored weights (`weightSlice`), on `model` or the latest. */
  weights(tensor: string, start: number, count: number, model?: ModelId): Promise<WeightSlice>;
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
  let live: number | undefined;

  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    const request = pending.get(data.id);
    if (!request) return; // cancelled or superseded: a stale reply
    pending.delete(data.id);
    if (live === data.id) live = undefined;
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
    worker.postMessage({ id: nextId++, type: "cancel", target: live } satisfies WorkerRequest);
    pending.get(live)?.reject(new CancelledError());
    pending.delete(live);
    live = undefined;
  };

  /** A request that supersedes the live one. */
  const exclusive = <T>(request: WorkerRequest): Promise<T> => {
    cancel();
    live = request.id;
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
    nextWords(word, k) {
      return exclusive<NextWord[]>({ id: nextId++, type: "nextWords", word, k });
    },
    neighbours(token, k) {
      return send<Neighbour[]>({ id: nextId++, type: "neighbours", token, k });
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
