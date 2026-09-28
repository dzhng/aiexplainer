/**
 * Chapter 1's run: each input's tokenizer pieces (id, text, length in bytes), read from the
 * shared tokenizer on the main thread: a table lookup, so it never goes to the worker.
 */
import type { PiecesRun } from "../../scene/build-frame.ts";
import type { SceneRunFn } from "../scene-run.ts";

export const tokenizerRun: SceneRunFn = async (def, text, { model }) => {
  const { tokenizer } = model;
  if (!tokenizer) throw new Error("the tokenizer chapter needs the shared tokenizer");
  const inputs = text === null ? (def.loop.inputs ?? []) : [text];
  const steps: PiecesRun["steps"] = inputs.map((input) => {
    const ids = tokenizer.encode(input);
    const pieces = tokenizer.pieces(ids).map(({ text, byteSpan: [start, end] }, i) => ({
      id: ids[i]!,
      text,
      bytes: end - start,
    }));
    return { text: input, pieces };
  });
  return { kind: "pieces", vocab: tokenizer.vocabSize, steps };
};
