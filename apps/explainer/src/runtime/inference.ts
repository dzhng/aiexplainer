/**
 * What the inference worker does, with no messaging: it holds every model it has loaded,
 * keyed by id, and answers requests against the latest one loaded (or a named one). The
 * worker (`session.worker.ts`) wraps it in messages; `localSession` wraps it in-process for
 * tests and the fixture-run script, so both paths run the same code.
 */
import {
  countsModel,
  fetchModel,
  forward,
  generate,
  seededRng,
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
import type { GenerateRequest, ModelInfo, RunOptions } from "./session.ts";

type Held = { loaded: LoadedModel } & (
  | { kind: "transformer"; transformer: Transformer }
  | { kind: "counts"; counts: CountsModel }
);

export interface Inference {
  load(manifestUrl: URL): Promise<ModelInfo>;
  run(tokens: number[], options?: RunOptions): ForwardResult;
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
  nextWords(word: string, k: number): NextWord[];
  neighbours(token: number, k: number): Neighbour[];
  /** A run of a loaded model's stored weights (`weightSlice`), on `model` or the latest. */
  weights(tensor: string, start: number, count: number, model?: string): WeightSlice;
}

export function createInference(): Inference {
  const held = new Map<string, Held>();
  const infos = new Map<string, ModelInfo>();
  let current: string | undefined;

  const transformer = (id: string | undefined, what: string): Transformer => {
    const model = id === undefined ? undefined : held.get(id);
    if (model?.kind !== "transformer") throw new Error(`${what} needs a loaded transformer`);
    return model.transformer;
  };

  return {
    async load(manifestUrl) {
      const loaded = await fetchModel(manifestUrl);
      const { manifest } = loaded;
      if (!held.has(manifest.id)) {
        held.set(
          manifest.id,
          manifest.kind === "transformer"
            ? { kind: "transformer", loaded, transformer: transformerModel(loaded) }
            : { kind: "counts", loaded, counts: countsModel(loaded) },
        );
        const info: ModelInfo = {
          id: manifest.id,
          kind: manifest.kind,
          evidence: manifest.evidence,
        };
        if (manifest.kind === "transformer") info.arch = manifest.arch;
        infos.set(manifest.id, info);
      }
      current = manifest.id;
      return infos.get(manifest.id)!;
    },
    run(tokens, options = {}) {
      const { model, ...forwardOptions } = options;
      return forward(transformer(model ?? current, "run"), tokens, forwardOptions);
    },
    async generate(tokens, options, pause, stopped) {
      const { model, seed, ...rest } = options;
      const steps: GenerateStep[] = [];
      for (const step of generate(transformer(model ?? current, "generate"), tokens, {
        ...rest,
        rng: seededRng(seed),
      })) {
        steps.push(step);
        await pause?.();
        if (stopped?.()) break;
      }
      return steps;
    },
    neighbours(token, k) {
      return nearestTokens(transformer(current, "neighbours"), token, k);
    },
    weights(tensor, start, count, model) {
      const id = model ?? current;
      const entry = id === undefined ? undefined : held.get(id);
      if (!entry) throw new Error(`weights needs a loaded model (${id ?? "none"})`);
      return weightSlice(entry.loaded, tensor, start, count);
    },
    nextWords(word, k) {
      const model = current === undefined ? undefined : held.get(current);
      if (model?.kind !== "counts") throw new Error("nextWords needs a loaded counts model");
      return nextWords(model.counts, word, k);
    },
  };
}
