/**
 * Chapter 9: the generation loop. The `full` model writes six words after chapter 8's prompt
 * (the same seeded draw as chapter 8's page), rereading the whole text for every word; the work
 * counter adds up what each step fed. That rereading is the failure chapter 10 fixes.
 */
import type { ChapterDef } from "../types.ts";

export const generation: ChapterDef = {
  slug: "generation",
  title: "Write a word, read it all again",
  why: "One pass through the machine predicts just one next word, never a whole story.",
  model: "full",
  scene: "generation",
  caption: {
    story: [
      "To write a story the machine picks one word, adds it to the end of the text, and starts again.",
      "Every time, it rereads the whole text from the very first word, so each new word costs a little more.",
    ],
    technical:
      "Autoregressive generation: sample the next token from the model's output, append it to the input, and run the full forward pass again over every token.",
  },
  brief: [
    "One pass through the machine predicts only the next word.",
    "To write a story, it adds that word to the end of the text and starts over.",
    "Watch it reread everything from the first word each time, and see the cost climb.",
  ],
  stats: [
    {
      id: "context",
      label: "longest text it can read",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "context" },
    },
    {
      id: "reread",
      label: "tokens read to write that much",
      format: "int",
      scale: "this tiny model",
      value: { kind: "arith", fn: "rereadTokens", args: { tokens: 256 } },
    },
    {
      id: "llama-context",
      label: "longest text a big model reads",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "maxContext", args: {} },
    },
  ],
  scenarios: [
    {
      id: "little",
      label: "Once upon a time, there was a little",
      prompt: "Once upon a time, there was a little",
      probe: "val-loss",
    },
    {
      id: "jack",
      label: "One day, Jack was walking",
      prompt: "One day, Jack was walking",
      probe: "val-loss",
    },
  ],
  labels: [
    { anchor: "machine", analogy: "The whole machine", technical: "Forward pass (4 layers)" },
    { anchor: "rail", analogy: "The text so far", technical: "Input tokens" },
    { anchor: "counter", analogy: "Words reread", technical: "Tokens processed" },
  ],
  loop: {
    durationSec: 24,
    endSec: 22.4,
    inputs: ["Once upon a time, there was a little"],
    channels: {
      /** Steps done (integer part) and the live step's phase (fraction), 3 s a word. */
      step: [
        { t: 0, v: 0 },
        { t: 1, v: 0 },
        { t: 19, v: 6 },
        { t: 23.4, v: 6 },
        { t: 23.5, v: 0, ease: "step" },
      ],
      failure: [
        { t: 0, v: 0 },
        { t: 19.2, v: 0, ease: "step" },
        { t: 19.3, v: 1, ease: "step" },
        { t: 22.4, v: 1 },
        { t: 22.5, v: 0, ease: "step" },
      ],
      /** The written words and the count clear before the seam. */
      fade: [
        { t: 0, v: 1 },
        { t: 22.4, v: 1 },
        { t: 23.4, v: 0, ease: "inOut" },
        { t: 23.5, v: 1, ease: "step" },
      ],
    },
    beats: [
      { t: 0, id: "text", note: "the text sits on the rail", focus: "rail" },
      {
        t: 1,
        id: "reread",
        note: "the machine rereads every word from the first, then runs its four blocks",
        focus: "machine",
        tint: "flow",
      },
      { t: 2.8, id: "write", note: "a new word flies back to the end of the text", focus: "rail" },
      { t: 4, id: "again", note: "and again: each step rereads one more word", focus: "counter" },
      {
        t: 19.2,
        id: "waste",
        note: "the counter shows it: every word rereads everything before it",
        focus: "counter",
      },
      {
        t: 22.4,
        id: "reset",
        note: "the written words clear; the loop starts again",
        focus: "rail",
      },
    ],
  },
  shot: "generation-line",
  help: { sources: [] },
  ogTimeSec: 13.5,
};
