// The inference worker (D38): holds the current model and answers requests in order; every
// model it loads stays cached by manifest URL, for requests that name their model.
// Its only client is session.ts, which owns cancellation and drops stale replies.
import {
  continueText,
  countsModel,
  fetchModel,
  forward,
  nearestTokens,
  nextWords,
  transformerModel,
  weightSlice,
  type CountsModel,
  type ForwardTrace,
  type LoadedModel,
  type Transformer,
} from "@repo/llm";
import type { ModelInfo, WorkerReply, WorkerRequest } from "./session.ts";

declare const self: Worker;

type Held =
  | { kind: "transformer"; loaded: LoadedModel; transformer: Transformer }
  | { kind: "counts"; loaded: LoadedModel; counts: CountsModel };

let model: Held | undefined;
const cache = new Map<string, Promise<Held>>();

/** The model at `manifestUrl`, fetched and prepared once. */
function held(manifestUrl: string): Promise<Held> {
  let entry = cache.get(manifestUrl);
  if (!entry) {
    entry = fetchModel(new URL(manifestUrl)).then((loaded) =>
      loaded.manifest.kind === "transformer"
        ? { kind: "transformer", loaded, transformer: transformerModel(loaded) }
        : { kind: "counts", loaded, counts: countsModel(loaded) },
    );
    cache.set(manifestUrl, entry);
  }
  return entry;
}

async function heldTransformer(manifestUrl: string): Promise<Transformer> {
  const h = await held(manifestUrl);
  if (h.kind !== "transformer") throw new Error(`${h.loaded.manifest.id} is not a transformer`);
  return h.transformer;
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const [result, transfer] = await handle(data);
    self.postMessage({ id: data.id, ok: true, result } satisfies WorkerReply, { transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id: data.id, ok: false, error: message } satisfies WorkerReply);
  }
};

async function handle(request: WorkerRequest): Promise<[unknown, Transferable[]]> {
  switch (request.type) {
    case "load": {
      model = await held(request.manifestUrl);
      const { manifest } = model.loaded;
      const info: ModelInfo = { id: manifest.id, kind: manifest.kind, evidence: manifest.evidence };
      if (manifest.kind === "transformer") info.arch = manifest.arch;
      return [info, []];
    }
    case "run": {
      if (model?.kind !== "transformer") throw new Error("run needs a loaded transformer");
      const result = forward(model.transformer, request.tokens, {
        trace: request.trace,
        window: request.window,
      });
      return [result, [result.logits.buffer, ...traceBuffers(result.trace)]];
    }
    case "neighbours": {
      if (model?.kind !== "transformer") throw new Error("neighbours needs a loaded transformer");
      return [nearestTokens(model.transformer, request.token, request.k), []];
    }
    case "continue": {
      const transformer = await heldTransformer(request.manifestUrl);
      return [continueText(transformer, request.text, request.count), []];
    }
    case "weights": {
      const { loaded } = await held(request.manifestUrl);
      return [weightSlice(loaded, request.tensor, request.start, request.count), []];
    }
    case "nextWords": {
      if (model?.kind !== "counts") throw new Error("nextWords needs a loaded counts model");
      return [nextWords(model.counts, request.word, request.k), []];
    }
  }
}

/** Every trace array's buffer, so the reply moves them instead of copying. */
function traceBuffers(trace: ForwardTrace | undefined): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  const visit = (value: unknown): void => {
    if (value instanceof Float32Array) buffers.push(value.buffer as ArrayBuffer);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(trace);
  return buffers;
}
