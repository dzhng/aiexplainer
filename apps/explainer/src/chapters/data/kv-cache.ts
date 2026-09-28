/**
 * Chapter 10: the KV cache as sticky notes. Chapter 9's text and draw, written with notes kept
 * (each word's keys and values written once, read by every later word), then GQA's shared
 * notes, then a sliding window that keeps only the last few (it changes the words written;
 * Llama-3-8B does not run this way). The failure beat: each word still waits on the weights.
 *
 * The knob is the window: the notes each block keeps, from 4 words up to all of them. Every
 * stop is a real generation with that window (`runtime/runs/kv-cache.ts`); on this prompt only
 * the smallest changes the words, and the scene says so.
 */
import type { ChapterDef } from "../types.ts";

export const kvCache: ChapterDef = {
  slug: "kv-cache",
  title: "Sticky notes",
  why: "Writing each new word meant rereading the whole text from the very first word.",
  model: "full",
  scene: "kv-cache",
  caption: {
    story: [
      "As each word passes through, the machine jots sticky notes about it and pins them to a rack.",
      "Later words read the notes instead of rereading the text, so each new word costs just one word's work.",
    ],
    technical:
      "The KV cache: every layer stores each position's attention keys and values once; a new token computes only its own and attends over the cached ones. Here 4 query heads share 2 key/value heads (grouped-query attention). The knob's sliding window attends to the last N positions only; it changes outputs and is not how Llama-3-8B runs.",
  },
  brief: [
    "Rereading the whole text for every new word wastes work.",
    "Here the machine pins sticky notes about each word to a rack, and later words read the notes instead.",
    "Watch the rack fill, then see what changes when it keeps only the last few words' notes.",
  ],
  stats: [
    {
      id: "tiny-notes",
      label: "notes per word",
      format: "bytes",
      scale: "this tiny model",
      value: { kind: "model", metric: "kvBytesPerToken" },
    },
    {
      id: "llama-notes",
      label: "notes per word",
      format: "bytes",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "kvBytesPerToken", args: { kvBytes: 2 } },
    },
    {
      id: "llama-weights",
      label: "weights read for every word",
      format: "bytes",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "weightBytes", args: { weightBytes: 2 } },
    },
  ],
  slider: {
    id: "window",
    label: "Notes kept (words)",
    hint: "Fewer notes save memory but can change the words.",
    min: 4,
    max: 9,
    step: 1,
    initial: 9,
    maxLabel: "all",
    loop: "keep",
  },
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
    { anchor: "rack", analogy: "Sticky notes", technical: "KV cache" },
    { anchor: "machine", analogy: "The whole machine", technical: "Forward pass (4 layers)" },
    { anchor: "rail", analogy: "The text so far", technical: "Input tokens" },
  ],
  loop: {
    durationSec: 26,
    endSec: 25.2,
    inputs: ["Once upon a time, there was a little"],
    channels: {
      /** Steps done and the live step's phase, 3 s a word: the first pass writes the notes. */
      step: [
        { t: 0, v: 0 },
        { t: 0.6, v: 0 },
        { t: 10.6, v: 4 },
        { t: 25.2, v: 4 },
        { t: 25.3, v: 0, ease: "step" },
      ],
      /** The notes unshared readers would need appear, then drop away. */
      ghost: [
        { t: 0, v: 0 },
        { t: 11.2, v: 0 },
        { t: 12, v: 1, ease: "inOut" },
        { t: 14.4, v: 1 },
        { t: 15.2, v: 0, ease: "inOut" },
      ],
      shared: [
        { t: 0, v: 0 },
        { t: 15.1, v: 0, ease: "step" },
        { t: 15.2, v: 1, ease: "step" },
        { t: 17.3, v: 1 },
        { t: 17.4, v: 0, ease: "step" },
      ],
      /** The window the loop shows, and the HUD slider with it: all, then the last 4. */
      keep: [
        { t: 0, v: 9, ease: "step" },
        { t: 17.4, v: 4, ease: "step" },
        { t: 23.2, v: 9, ease: "step" },
      ],
      /** Keep only the last few: older columns are evicted. */
      window: [
        { t: 0, v: 0 },
        { t: 17.4, v: 0 },
        { t: 18.8, v: 1, ease: "inOut" },
        { t: 22.4, v: 1 },
        { t: 23.2, v: 0, ease: "inOut" },
      ],
      trip: [
        { t: 0, v: 0 },
        { t: 23.4, v: 0, ease: "step" },
        { t: 23.5, v: 1, ease: "step" },
        { t: 25.2, v: 1 },
        { t: 25.3, v: 0, ease: "step" },
      ],
    },
    beats: [
      {
        t: 0.6,
        id: "write-notes",
        note: "the first pass reads the text once and pins a column of notes per word",
        focus: "rack",
        tint: "flow",
      },
      {
        t: 3.6,
        id: "read-notes",
        note: "each new word feeds alone and reads the notes instead of the text",
        focus: "rail",
      },
      {
        t: 11.2,
        id: "share",
        note: "four readers share two sets of notes: half the rack",
        focus: "rack",
      },
      {
        t: 17.4,
        id: "window",
        note: "keep only the last 4: older notes are thrown away, and the words change",
        focus: "machine",
      },
      {
        t: 23.4,
        id: "trip",
        note: "still, every new word waits on a trip through all the weights",
        focus: "machine",
      },
      { t: 25.2, id: "reset", note: "the rack clears; the loop starts again", focus: "rack" },
    ],
  },
  shot: "kv-rack",
  help: { sources: [] },
  ogTimeSec: 11.5,
};
