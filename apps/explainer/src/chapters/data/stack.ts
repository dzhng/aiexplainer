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
    default: {
      story: [
        "Each block now has four readers, and each one looks back over the words for something different.",
        "Blocks are stacked like an assembly line, so every block refines the work of the one before it.",
      ],
      precisely:
        "Multi-head attention: 4 heads per layer, each with its own query, key and value weights; this tiny model stacks 4 layers (blocks), each attention then MLP, on the residual stream.",
    },
    byFollow: {
      readers: {
        story: [
          "Each reader's pipes are as wide as how much it draws from each word, and every reader draws differently.",
          "Readers of the same colour share one set of notes on the words, which saves memory later on.",
        ],
        precisely:
          "Pipe width is each head's attention weight from the last word. Heads 1–2 and 3–4 share key/value heads (grouped-query attention, 4 query heads over 2 KV heads).",
      },
      words: {
        story: [
          "The words sit on a rail at the bottom of every block, and every reader can look at any of them.",
          "Each block sees the words as the block before it left them, a little more worked out each time.",
        ],
        precisely:
          "Each block reads the residual stream at every position; the tiles stand for the tokens, and deeper blocks see them after earlier blocks' additions.",
      },
      block: {
        story: [
          "Pull back and the block is one station of four; a big model like Llama-3-8B lines up thirty-two.",
          "Together they write a whole story, but each pass through the line picks only its next word.",
        ],
        precisely:
          "The page is the model's own seeded continuation (temperature 0.8); producing it took one forward pass per new token.",
      },
    },
  },
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
  follow: [
    { id: "readers", label: "Readers", anchor: "readers" },
    { id: "words", label: "The words", anchor: "words" },
    { id: "block", label: "The line", anchor: "block" },
  ],
  slider: { id: "block", label: "Block to light up", min: 1, max: 4, step: 1, initial: 1 },
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
  views: ["whole", "exploded"],
  labels: [
    { anchor: "readers", analogy: "Readers", precise: "Attention heads" },
    { anchor: "words", analogy: "The words so far", precise: "Token positions" },
    { anchor: "block", analogy: "One block", precise: "Transformer layer" },
    { anchor: "line", analogy: "The assembly line", precise: "Stacked layers" },
  ],
  loop: {
    durationSec: 23,
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
