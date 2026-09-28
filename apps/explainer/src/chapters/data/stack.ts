/**
 * Chapter 8: several readers (attention heads) per block, and an assembly line of blocks
 * (layers), with the ladder's one zoom-out (D5). The `full` model: 4 blocks, 4 heads sharing
 * 2 sets of notes (GQA, D36). The loop prompt is the `full` probe's first continuation prompt.
 */
import type { ChapterDef } from "../types.ts";

/** The continuation's draw (chapters 8–10): a fixed seed, so the page reads the same on every visit. */
export const CONTINUATION = { seed: 3, temperature: 0.8, maxNewTokens: 24 } as const;

export const stack: ChapterDef = {
  slug: "stack",
  title: "Many readers, one assembly line",
  why: "One reader looking once, then one pass through the stations, leaves the machine unsure.",
  model: "full",
  scene: "stack",
  caption: {
    story: [
      "Each block now has four readers, and each one looks back over the words for something different.",
      "Blocks are stacked like an assembly line, so every block refines the work of the one before it.",
    ],
    technical:
      "Multi-head attention: 4 heads per layer, each with its own query, key and value weights; this tiny model stacks 4 layers (blocks), each attention then MLP, on the residual stream.",
  },
  brief: [
    "One reader looking once still leaves the machine unsure.",
    "Here each block gets four readers that look back for different things, and blocks stack like an assembly line.",
    "Watch the camera pull back to show the whole line, and notice that one pass still writes just one word.",
  ],
  stats: [
    {
      id: "readers",
      label: "readers in each block",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "heads" },
    },
    {
      id: "differ",
      label: "how differently two readers look",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "heads-differ" },
    },
    {
      id: "llama-blocks",
      label: "blocks in the line",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "layers", args: {} },
    },
  ],
  scenarios: [
    {
      id: "bird",
      label: "One day, a little bird was looking for",
      prompt: "One day, a little bird was looking for",
      probe: "heads-differ",
    },
    {
      id: "little",
      label: "Once upon a time, there was a little",
      prompt: "Once upon a time, there was a little",
      probe: "heads-differ",
    },
  ],
  labels: [
    { anchor: "readers", analogy: "Readers", technical: "Attention heads" },
    { anchor: "words", analogy: "The words so far", technical: "Token positions" },
    { anchor: "block", analogy: "One block", technical: "Transformer layer" },
    { anchor: "line", analogy: "The assembly line", technical: "Stacked layers" },
  ],
  loop: {
    durationSec: 23,
    endSec: 21.6,
    inputs: ["One day, a little bird was looking for"],
    channels: {
      tokens: [
        { t: 0, v: 0 },
        { t: 1.2, v: 1 },
        { t: 21.6, v: 1 },
        { t: 22.6, v: 0, ease: "inOut" },
      ],
      heads: [
        { t: 0, v: 0 },
        { t: 1.2, v: 0 },
        { t: 5, v: 1 },
        { t: 21.6, v: 1 },
        { t: 22.6, v: 0, ease: "inOut" },
      ],
      /** The one zoom-out (D5): pull back to the whole line, hold briefly, return to block 1. */
      zoom: [
        { t: 0, v: 0 },
        { t: 6.2, v: 0 },
        { t: 7.8, v: 1, ease: "inOut" },
        { t: 9.2, v: 1 },
        { t: 10.8, v: 0, ease: "inOut" },
      ],
      write: [
        { t: 0, v: 0 },
        { t: 11.2, v: 0 },
        { t: 15.4, v: 1 },
        { t: 16.4, v: 1 },
        { t: 16.5, v: 0, ease: "step" },
      ],
      /** One pass runs down the line, belt by belt; its one word lands on the rail. */
      pass: [
        { t: 0, v: 0 },
        { t: 16.6, v: 0 },
        { t: 18.6, v: 1 },
        { t: 21.6, v: 1 },
        { t: 21.7, v: 0, ease: "step" },
      ],
      failure: [
        { t: 0, v: 0 },
        { t: 16.5, v: 0, ease: "step" },
        { t: 16.6, v: 1, ease: "step" },
        { t: 21.6, v: 1 },
        { t: 21.7, v: 0, ease: "step" },
      ],
    },
    beats: [
      { t: 0, id: "words", note: "the words land on block 1's rail", focus: "words" },
      {
        t: 1.2,
        id: "readers",
        note: "four readers each draw from the words differently; same colour, shared notes",
        focus: "readers",
        tint: "flow",
      },
      {
        t: 6.2,
        id: "zoom-out",
        note: "the one pull-back: four blocks in a line (Llama-3-8B has 32), then back",
        focus: "line",
      },
      { t: 11.2, id: "write", note: "the line writes a whole continuation", focus: "block" },
      {
        t: 16.6,
        id: "one-word",
        note: "but one pass down the line writes only one word",
        focus: "block",
      },
      { t: 21.6, id: "reset", note: "the rail clears; the loop starts again", focus: "words" },
    ],
  },
  shot: "stack-block",
  pullBack: { shot: "stack-wide", channel: "zoom" },
  help: { sources: [] },
  ogTimeSec: 5.5,
};
