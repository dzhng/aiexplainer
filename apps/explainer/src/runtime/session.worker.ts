// The inference worker (D38): answers requests in order with `createInference`. Its only
// client is session.ts, which owns cancellation and drops stale replies.
import type { ForwardTrace } from "@repo/llm";
import { createInference, stopFlags } from "./inference.ts";
import type { WorkerReply, WorkerRequest } from "./session.ts";

declare const self: Worker;

const inference = createInference();
const stops = stopFlags();
/** A macrotask break, so a `cancel` message can arrive between tokens. */
const breather = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === "cancel") {
    stops.stop(data.target);
    return;
  }
  try {
    const [result, transfer] = await handle(data);
    self.postMessage({ id: data.id, ok: true, result } satisfies WorkerReply, { transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id: data.id, ok: false, error: message } satisfies WorkerReply);
  }
};

async function handle(
  request: Exclude<WorkerRequest, { type: "cancel" }>,
): Promise<[unknown, Transferable[]]> {
  switch (request.type) {
    case "load":
      return [await inference.load(new URL(request.manifestUrl)), []];
    case "run": {
      const result = inference.run(request.tokens, request.options);
      return [result, [result.logits.buffer, ...traceBuffers(result.trace)]];
    }
    case "generate":
      return [
        await stops.during(request.id, (stopped) =>
          inference.generate(request.tokens, request.options, breather, stopped),
        ),
        [],
      ];
    case "neighbours":
      return [inference.neighbours(request.model, request.token, request.k), []];
    case "speculate":
      return [inference.speculate(request.tokens, request.options), []];
    case "weights":
      return [inference.weights(request.tensor, request.start, request.count, request.model), []];
    case "nextWords":
      return [inference.nextWords(request.model, request.word, request.k), []];
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
