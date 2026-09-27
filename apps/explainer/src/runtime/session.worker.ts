// The inference worker (D38): answers requests in order with `createInference`. Its only
// client is session.ts, which owns cancellation and drops stale replies.
import type { ForwardTrace } from "@repo/llm";
import { createInference } from "./inference.ts";
import type { WorkerReply, WorkerRequest } from "./session.ts";

declare const self: Worker;

const inference = createInference();

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
    case "load":
      return [await inference.load(new URL(request.manifestUrl)), []];
    case "run": {
      const result = inference.run(request.tokens, request.options);
      return [result, [result.logits.buffer, ...traceBuffers(result.trace)]];
    }
    case "neighbours":
      return [inference.neighbours(request.token, request.k), []];
    case "nextWords":
      return [inference.nextWords(request.word, request.k), []];
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
