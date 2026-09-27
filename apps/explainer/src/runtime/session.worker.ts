// The inference worker (D38): holds one loaded model and answers requests in order.
// Its only client is session.ts, which owns cancellation and drops stale replies.
import {
  countsModel,
  fetchModel,
  forward,
  nextWords,
  transformerModel,
  type CountsModel,
  type ForwardTrace,
  type Transformer,
} from "@repo/llm";
import type { ModelInfo, WorkerReply, WorkerRequest } from "./session.ts";

declare const self: Worker;

let model:
  | { kind: "transformer"; transformer: Transformer }
  | { kind: "counts"; counts: CountsModel };

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
      const loaded = await fetchModel(new URL(request.manifestUrl));
      const { manifest } = loaded;
      model =
        manifest.kind === "transformer"
          ? { kind: "transformer", transformer: transformerModel(loaded) }
          : { kind: "counts", counts: countsModel(loaded) };
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
