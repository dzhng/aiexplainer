// The inference session (D38): a Web Worker running packages/llm, so a typed prompt
// never blocks the controls. One request is live at a time: a new request, or
// `cancel()`, rejects the previous one with `CancelledError`, and the worker's late
// reply to it is dropped. (The worker finishes the stale computation; it is never
// interrupted mid-forward, only ignored.)
import type {
  ForwardResult,
  ModelId,
  ModelManifest,
  Neighbour,
  NextWord,
  ProbeResult,
  TraceSpec,
  TransformerArch,
} from "@repo/llm";
import { modelManifestUrl } from "./models.ts";

export interface ModelInfo {
  id: string;
  kind: ModelManifest["kind"];
  arch?: TransformerArch;
  evidence: ProbeResult[];
}

export type WorkerRequest = { id: number } & (
  | { type: "load"; manifestUrl: string }
  | { type: "run"; tokens: number[]; trace?: TraceSpec; window?: number }
  | { type: "nextWords"; word: string; k: number }
  | { type: "neighbours"; token: number; k: number }
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
  /** Loads a shipped model by id, or any manifest by URL (lab fixtures). */
  load(model: ModelId | URL): Promise<ModelInfo>;
  run(tokens: number[], trace?: TraceSpec, window?: number): Promise<ForwardResult>;
  nextWords(word: string, k: number): Promise<NextWord[]>;
  /** The loaded transformer's nearest tokens in its input embedding table. */
  neighbours(token: number, k: number): Promise<Neighbour[]>;
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
    run(tokens, trace, window) {
      return exclusive<ForwardResult>({ id: nextId++, type: "run", tokens, trace, window });
    },
    nextWords(word, k) {
      return exclusive<NextWord[]>({ id: nextId++, type: "nextWords", word, k });
    },
    neighbours(token, k) {
      return send<Neighbour[]>({ id: nextId++, type: "neighbours", token, k });
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
