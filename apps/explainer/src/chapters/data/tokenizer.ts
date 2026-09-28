/**
 * Chapter 1: the tokenizer, as toy bricks from a fixed box of shapes. The pieces come from the
 * shared tokenizer itself: chapter 0's unseen “onse” splits into two known bricks, a sentence
 * lays out as a row of bricks with the rare “birdcage” in three (the rare-word probe), and the
 * failure the next chapter fixes is that “cat” and “kitten” are just two unrelated ids.
 */
import type { ChapterDef } from "../types.ts";

export const tokenizer: ChapterDef = {
  slug: "tokenizer",
  title: "Tokenizer",
  why: "Chapter 0 had no row for a word it never saw, like “onse”. So stop storing whole words.",
  model: "tokenizer",
  scene: "tokenizer",
  caption: {
    story: [
      "Instead of whole words, the machine keeps a fixed box of word pieces, like toy bricks, and builds any text from them.",
      "Common words are one brick, and a rare word like “birdcage” snaps into several, so no word is ever missing.",
    ],
    technical:
      "A tokenizer splits text into tokens, pieces from a fixed vocabulary, and stores each as its id. This one is byte-pair encoding (BPE), learned from TinyStories by repeatedly merging the most common pair of neighbouring pieces.",
  },
  stats: [
    {
      id: "vocab",
      label: "shapes in the box",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "vocabSize" },
    },
    {
      id: "chars-per-brick",
      label: "characters per brick",
      format: "num",
      scale: "TinyStories",
      value: { kind: "probe", probe: "chars-per-token" },
    },
    {
      id: "llama-vocab",
      label: "shapes in the box",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "vocab", args: {} },
    },
  ],
  scenarios: [
    {
      id: "tim",
      label: "Once upon a time",
      prompt: "Once upon a time, there was a little boy named Tim.",
      probe: "single-piece-words",
    },
    {
      id: "birdcage",
      label: "It was a birdcage",
      prompt: "It was a birdcage!",
      probe: "rare-word-split",
    },
  ],
  labels: [
    { anchor: "bricks", analogy: "A brick: one known piece", technical: "Token" },
    { anchor: "ids", analogy: "The number stamped on it", technical: "Token id" },
    { anchor: "box", analogy: "The box of shapes", technical: "Vocabulary" },
    { anchor: "text", analogy: "Your text, in bricks", technical: "Encoded input" },
  ],
  loop: {
    durationSec: 24,
    inputs: ["onse", "It was a birdcage!", "The cat and the kitten."],
    channels: {
      /** Which loop input is on show; it changes only while no brick is. */
      input: [
        { t: 0, v: 0, ease: "step" },
        { t: 6.25, v: 1, ease: "step" },
        { t: 15.25, v: 2, ease: "step" },
      ],
      /** Chapter 0's word card: slides onto the plate, then leaves as its bricks drop in. */
      card: [
        { t: 0, v: 0 },
        { t: 0.9, v: 1, ease: "inOut" },
        { t: 2.6, v: 1 },
        { t: 3.1, v: 0, ease: "inOut" },
      ],
      /** Bricks come out of the box left to right (0 → 1) and go back right to left (1 → 0). */
      bricksIn: [
        { t: 0, v: 0 },
        { t: 2.7, v: 0 },
        { t: 3.6, v: 1, ease: "inOut" },
        { t: 5.6, v: 1 },
        { t: 6.2, v: 0, ease: "inOut" },
        { t: 6.4, v: 0 },
        { t: 8.2, v: 1, ease: "inOut" },
        { t: 14.4, v: 1 },
        { t: 15.1, v: 0, ease: "inOut" },
        { t: 15.3, v: 0 },
        { t: 16.8, v: 1, ease: "inOut" },
        { t: 22.6, v: 1 },
        { t: 23.3, v: 0, ease: "inOut" },
      ],
      /** Ids are stamped on left to right. */
      ids: [
        { t: 0, v: 0 },
        { t: 8.4, v: 0 },
        { t: 9.4, v: 1 },
        { t: 14.4, v: 1 },
        { t: 14.6, v: 0 },
        { t: 16.9, v: 0 },
        { t: 17.6, v: 1 },
        { t: 22.6, v: 1 },
        { t: 22.8, v: 0 },
      ],
      /** The box of shapes lights up. */
      box: [
        { t: 0, v: 0 },
        { t: 10.4, v: 0 },
        { t: 11, v: 1, ease: "inOut" },
        { t: 13.6, v: 1 },
        { t: 14.2, v: 0, ease: "inOut" },
      ],
      /** The failure pair lights up. */
      pair: [
        { t: 0, v: 0 },
        { t: 18.2, v: 0 },
        { t: 18.8, v: 1, ease: "inOut" },
        { t: 22.4, v: 1 },
        { t: 22.9, v: 0, ease: "inOut" },
      ],
      /** The note under the snapped word. */
      snapNote: [
        { t: 0, v: 0, ease: "step" },
        { t: 3.5, v: 1, ease: "step" },
        { t: 5.8, v: 0, ease: "step" },
      ],
    },
    beats: [
      {
        t: 0,
        id: "word-returns",
        note: "chapter 0's unseen “onse” slides onto the plate",
        focus: "text",
      },
      {
        t: 2.7,
        id: "snap",
        note: "the card leaves; “onse” is rebuilt from two bricks the box does have, “on” and “se”",
        focus: "bricks",
        tint: "focus",
      },
      {
        t: 6.25,
        id: "sentence",
        note: "a sentence comes out of the box as a row of bricks; “birdcage” takes three",
        focus: "bricks",
      },
      { t: 8.4, id: "ids", note: "each brick is stamped with its id", focus: "ids" },
      {
        t: 10.4,
        id: "box",
        note: "the box of shapes lights up: every text comes from it",
        focus: "box",
      },
      {
        t: 15.25,
        id: "pair-lands",
        note: "“The cat and the kitten.” comes out of the box",
        focus: "bricks",
      },
      {
        t: 18.2,
        id: "failure",
        note: "“cat” and “kitten” light up: two unrelated numbers, nothing says they're alike",
        focus: "ids",
        tint: "focus",
      },
      {
        t: 22.6,
        id: "reset",
        note: "the bricks go back in the box; the loop starts again",
        focus: "text",
      },
    ],
  },
  shot: "brick-table",
  // TinyStories is credited once, by the help panel itself, for every chapter.
  help: { sources: [] },
  ogTimeSec: 12,
};
