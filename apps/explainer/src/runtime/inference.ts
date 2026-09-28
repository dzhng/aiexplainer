/**
 * What the inference worker does, with no messaging: it holds every model it has loaded,
 * keyed by id, and answers each request on the model it names (there is no "current" model,
 * so a late load from a superseded chapter cannot change what a request runs on). The
 * worker (`session.worker.ts`) wraps it in messages; `localSession` wraps it in-process for
 * tests and the fixture-run script, so both paths run the same code.
 */
import {
  countsModel,
  fetchModel,
  forward,
  generate,
  seededRng,
  speculate,
  type SpeculativeResult,
  type GenerateStep,
  nearestTokens,
  nextWords,
  transformerModel,
  weightSlice,
  type CountsModel,
  type LoadedModel,
  type ForwardResult,
  type Neighbour,
  type NextWord,
  type Transformer,
  type WeightSlice,
} from "@repo/llm";
import type {
  GenerateRequest,
  HeldId,
  ModelInfo,
  RunOptions,
  SpeculateRequest,
} from "./session.ts";
import { onceUntilFailure } from "./once.ts";

type Held = { loaded: LoadedModel } & (
  | { kind: "transformer"; transformer: Transformer }
  | { kind: "counts"; counts: CountsModel }
);

export interface Inference {
  /** Fetches a model once (by manifest URL) and holds it under its id. */
  load(manifestUrl: URL): Promise<ModelInfo>;
  run(tokens: number[], options: RunOptions): ForwardResult;
  /**
   * Runs a seeded generation, awaiting `pause()` between tokens; it stops early (returning what
   * it has) once `stopped()` says so.
   */
  generate(
    tokens: number[],
    options: GenerateRequest,
    pause?: () => Promise<void>,
    stopped?: () => boolean,
  ): Promise<GenerateStep[]>;
  nextWords(model: HeldId, word: string, k: number): NextWord[];
  neighbours(model: HeldId, token: number, k: number): Neighbour[];
  /** Speculative decoding (`speculate`): `drafter` guesses, `target` checks; both loaded. */
  speculate(tokens: number[], options: SpeculateRequest): SpeculativeResult;
  /** A run of a loaded model's stored weights (`weightSlice`). */
  weights(tensor: string, start: number, count: number, model: HeldId): WeightSlice;
}

export function createInference(): Inference {
  const held = new Map<string, Held>();

  const transformer = (id: HeldId, what: string): Transformer => {
    const model = held.get(id);
    if (model?.kind !== "transformer")
      throw new Error(`${what} needs a loaded transformer (${id})`);
    return model.transformer;
  };

  const fetchAndHold = async (manifestUrl: URL): Promise<ModelInfo> => {
    const loaded = await fetchModel(manifestUrl);
    const { manifest } = loaded;
    if (!held.has(manifest.id))
      held.set(
        manifest.id,
        manifest.kind === "transformer"
          ? { kind: "transformer", loaded, transformer: transformerModel(loaded) }
          : { kind: "counts", loaded, counts: countsModel(loaded) },
      );
    const info: ModelInfo = { id: manifest.id, kind: manifest.kind, evidence: manifest.evidence };
    if (manifest.kind === "transformer") info.arch = manifest.arch;
    return info;
  };

  /** Each manifest URL's load, fetched once. */
  const loadOnce = onceUntilFailure((href: string) => fetchAndHold(new URL(href)));

  return {
    load: (manifestUrl) => loadOnce(manifestUrl.href),
    run(tokens, options) {
      const { model, ...forwardOptions } = options;
      return forward(transformer(model, "run"), tokens, forwardOptions);
    },
    async generate(tokens, options, pause, stopped) {
      const { model, seed, ...rest } = options;
      const steps: GenerateStep[] = [];
      for (const step of generate(transformer(model, "generate"), tokens, {
        ...rest,
        rng: seededRng(seed),
      })) {
        steps.push(step);
        await pause?.();
        if (stopped?.()) break;
      }
      return steps;
    },
    neighbours(model, token, k) {
      return nearestTokens(transformer(model, "neighbours"), token, k);
    },
    speculate(tokens, { target, drafter, seed, ...rest }) {
      return speculate(
        transformer(target, "speculate"),
        transformer(drafter, "speculate"),
        tokens,
        {
          ...rest,
          rng: seededRng(seed),
        },
      );
    },
    weights(tensor, start, count, model) {
      const entry = held.get(model);
      if (!entry) throw new Error(`weights needs a loaded model (${model})`);
      return weightSlice(entry.loaded, tensor, start, count);
    },
    nextWords(model, word, k) {
      const entry = held.get(model);
      if (entry?.kind !== "counts")
        throw new Error(`nextWords needs a loaded counts model (${model})`);
      return nextWords(entry.counts, word, k);
    },
  };
}

/**
 * Stop flags for the worker's cancellable requests (generations), held only while one runs: a
 * cancel for a request that already finished, or never could stop, leaves nothing behind.
 */
export function stopFlags() {
  const running = new Map<number, { stopped: boolean }>();
  return {
    /** Runs `op` as request `id`, handing it a check for whether `id` was told to stop. */
    async during<T>(id: number, op: (stopped: () => boolean) => Promise<T>): Promise<T> {
      const flag = { stopped: false };
      running.set(id, flag);
      try {
        return await op(() => flag.stopped);
      } finally {
        running.delete(id);
      }
    },
    stop(id: number) {
      const flag = running.get(id);
      if (flag) flag.stopped = true;
    },
    /** Requests currently running. */
    get size() {
      return running.size;
    },
  };
}
