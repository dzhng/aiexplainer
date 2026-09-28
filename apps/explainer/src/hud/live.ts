/**
 * What the text box says about the model behind it: what kind of real thing is running (a
 * word-pair counts model and a tokenizer are not language models, so they are never called
 * one), what typing does, and the receipt once a run has answered. Every number is read off
 * the loaded model (its manifest and `MODEL_METRICS`), never typed in, and no time is shown:
 * browser time is never speed (D27).
 */
import { modelMetric, sourceId, type ModelSource } from "@repo/llm";
import { formatStat } from "../chapters/format.ts";

export interface LiveModel {
  /** After "LIVE ·": what is running, in the reader's browser. */
  what: string;
  /** The line under the empty text box: what typing will do. */
  invite: string;
  /** The line under the box once a run has answered the reader's text. */
  receipt: string;
}

const count = (n: number) => formatStat(n, "int");

export function liveModel(model: ModelSource): LiveModel {
  if (!("manifest" in model))
    return {
      what: "the real tokenizer every model here reads with, running in your browser",
      invite: "It splits your text into pieces as you type.",
      receipt: `split by the tokenizer: ${count(modelMetric(model, "vocabSize"))} pieces it knows`,
    };
  const { manifest } = model;
  if (manifest.kind === "word-counts")
    return {
      what: "a real word-pair counts model, running in your browser",
      invite: "It looks up your last word as you type.",
      receipt: `looked up in the counts model: ${count(modelMetric(model, "vocabSize"))} words it kept`,
    };
  const layers = manifest.arch.nLayers;
  return {
    what: "a real tiny language model, running in your browser",
    invite: "The model answers as you type.",
    receipt: `answered by the “${sourceId(model)}” model: ${layers} ${layers === 1 ? "layer" : "layers"}, ${count(modelMetric(model, "params.total"))} weights`,
  };
}
