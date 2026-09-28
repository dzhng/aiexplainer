/**
 * Chapter 2's run: a table lookup, not a forward pass. Each input's tokens, as they sit
 * mid-sentence, at their own embedding row's projection on the map, and the cosine of the
 * first two rows when there are two.
 */
import { transformerModel, type LoadedModel, type Transformer } from "@repo/llm";
import type { PinsRun } from "../../scene/build-frame.ts";
import { MAX_PINNED_INPUT, projectRow } from "../../scene/embed-map.ts";
import type { SceneRunFn } from "../scene-run.ts";

/** Each loaded transformer's weights as f32, decoded once. */
const transformers = new WeakMap<LoadedModel, Transformer>();
function transformer(model: LoadedModel): Transformer {
  let t = transformers.get(model);
  if (!t) transformers.set(model, (t = transformerModel(model)));
  return t;
}

/** How nearly two embeddings point the same way: 1 same, 0 unrelated, −1 opposite. */
function cosineOf(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let k = 0; k < a.length; k++) {
    dot += a[k]! * b[k]!;
    na += a[k]! ** 2;
    nb += b[k]! ** 2;
  }
  return dot / Math.sqrt(na * nb);
}

export const embeddingsRun: SceneRunFn = async (def, text, { model }) => {
  if (!("manifest" in model) || !model.tokenizer) throw new Error("embeddings needs `embed`");
  const { tokenizer } = model;
  const table = transformer(model);
  const d = table.arch.dModel;
  const rowOf = (id: number) => table.tokEmb.subarray(id * d, (id + 1) * d);
  const inputs = text === null ? (def.loop.inputs ?? []) : [text];
  const steps: PinsRun["steps"] = inputs.map((input) => {
    // Words as they sit mid-sentence, with their leading space: " cat", not "c" + "at".
    const ids = [...tokenizer.encode(` ${input.trim()}`)].slice(0, MAX_PINNED_INPUT);
    const pins = ids.map((id) => ({
      id,
      text: tokenizer.decode([id]),
      bytes: tokenizer.pieces([id])[0]!.byteSpan[1],
      at: projectRow(rowOf(id)),
    }));
    const cosine = ids.length >= 2 ? cosineOf(rowOf(ids[0]!), rowOf(ids[1]!)) : null;
    return { text: input, pins, cosine };
  });
  return { kind: "pins", steps };
};
