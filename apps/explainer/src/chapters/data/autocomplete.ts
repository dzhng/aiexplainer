/**
 * Chapter 0: next-word guessing from word-pair counts. The example
 * words come from the `counts` model itself: "upon" is its top next word after "once", its
 * top-successor probe measures "a" after "upon", and "onse" is a misspelling it never kept.
 * The loop shows the rule twice (once → upon → a), then the failure that chapter 1 fixes. The
 * loop's inputs are whole texts, like the reader's: the rail shows each, and the machine looks
 * only at its last word.
 */
import type { ChapterDef } from "../types.ts";

export const autocomplete: ChapterDef = {
  slug: "autocomplete",
  title: "Word-pair counts",
  why: "Start with the simplest thing that can guess the next word: remember what came next.",
  model: "counts",
  scene: "autocomplete",
  caption: {
    default: {
      story: [
        "Your phone's keyboard guesses your next word, and the simplest way to guess is to remember which word usually came next.",
        "This machine read millions of children's stories and kept a tally for every pair of words that sat side by side.",
      ],
      technical:
        "For each word it knows, this tiny model keeps the 20 words that most often came right after it in TinyStories; each bar is one word's share of those kept counts.",
    },
    byFollow: {
      counts: {
        story: [
          "Each word gets its own row of tallies, one mark for every time another word came right after it.",
          "Nothing here understands the words; it only remembers what came next, and how often.",
        ],
        technical:
          "The table stores count(w, x), how many times word x followed word w, as whole numbers, keeping only the most frequent x for each w.",
      },
      next: {
        story: [
          "The bars are the tallies for the word on the card, turned into shares that add up to all of it.",
          "The machine takes the tallest bar, puts that word on the card, and does the same thing again.",
        ],
        technical:
          "Each bar is count(w, x) divided by the sum of the kept counts for w; the loop picks the largest (greedy decoding).",
      },
      text: {
        story: [
          "The machine only ever looks at the last word, the one on the card, however long your sentence is.",
          "Give it a word it never saw, like the misspelt “onse”, and there is no row to read, so no bars appear.",
        ],
        technical:
          "The context is exactly one word; a word outside this tiny model's vocabulary has no counts, so it predicts nothing at all.",
      },
    },
  },
  stats: [
    {
      id: "words-counted",
      label: "words counted",
      format: "int",
      scale: "TinyStories",
      value: { kind: "model", metric: "training.tokensSeen" },
    },
    {
      id: "distinct-words",
      label: "distinct words kept",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "vocabSize" },
    },
    {
      id: "top-chance",
      label: "“a” after “upon”",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "top-successor" },
    },
  ],
  follow: [
    { id: "counts", label: "Counts", anchor: "board" },
    { id: "next", label: "Next word", anchor: "bars" },
    { id: "text", label: "Your text", anchor: "rail" },
  ],
  slider: { id: "shown", label: "Next words shown", min: 1, max: 10, step: 1, initial: 5 },
  scenarios: [{ id: "once", label: "Once upon a", prompt: "once upon a", probe: "top-successor" }],
  views: ["whole", "cutaway", "exploded"],
  labels: [
    {
      anchor: "bars",
      analogy: "How often each word came next",
      technical: "Share of the kept next-word counts",
    },
    { anchor: "rail", analogy: "The only word it looks at", technical: "Context: one word" },
  ],
  loop: {
    durationSec: 20,
    inputs: ["once", "once upon", "once upon a", "onse"],
    channels: {
      /** Which input is on the rail; it changes only while the card is off the rail. */
      railWord: [
        { t: 0, v: 0, ease: "step" },
        { t: 5, v: 1, ease: "step" },
        { t: 9.8, v: 2, ease: "step" },
        { t: 14.2, v: 3, ease: "step" },
      ],
      /** The card: 0 off the rail's right end, 1 resting on it. It leaves before each change. */
      railSlide: [
        { t: 0, v: 0 },
        { t: 0.8, v: 1, ease: "inOut" },
        { t: 4.6, v: 1 },
        { t: 5, v: 0, ease: "inOut" },
        { t: 5.8, v: 1, ease: "inOut" },
        { t: 9.4, v: 1 },
        { t: 9.8, v: 0, ease: "inOut" },
        { t: 10.6, v: 1, ease: "inOut" },
        { t: 13.8, v: 1 },
        { t: 14.2, v: 0, ease: "inOut" },
        { t: 14.9, v: 1, ease: "inOut" },
        { t: 18, v: 1 },
        { t: 18.9, v: 0, ease: "inOut" },
      ],
      /** Which input's counts the bars show; it lags the card, so the pick stays lit as it moves. */
      barsWord: [
        { t: 0, v: 0, ease: "step" },
        { t: 7.4, v: 1, ease: "step" },
        { t: 11.6, v: 2, ease: "step" },
        { t: 14.3, v: 3, ease: "step" },
      ],
      /** Bar growth: 0 flat, 1 at the word's real shares. */
      bars: [
        { t: 0, v: 0 },
        { t: 0.9, v: 0 },
        { t: 2.3, v: 1, ease: "inOut" },
        { t: 7, v: 1 },
        { t: 7.4, v: 0, ease: "inOut" },
        { t: 7.5, v: 0 },
        { t: 8.7, v: 1, ease: "inOut" },
        { t: 11.2, v: 1 },
        { t: 11.6, v: 0, ease: "inOut" },
        { t: 11.7, v: 0 },
        { t: 12.9, v: 1, ease: "inOut" },
        { t: 13.8, v: 1 },
        { t: 14.2, v: 0, ease: "inOut" },
        { t: 14.7, v: 0 },
        { t: 15, v: 1, ease: "inOut" },
        { t: 17.8, v: 1 },
        { t: 18.2, v: 0, ease: "inOut" },
      ],
      /** Glow on the tallest bar: the machine's pick, held until its word is on the card. */
      topFlash: [
        { t: 0, v: 0 },
        { t: 2.5, v: 0 },
        { t: 3, v: 1, ease: "inOut" },
        { t: 7, v: 1 },
        { t: 7.4, v: 0, ease: "inOut" },
        { t: 8.7, v: 0 },
        { t: 9.1, v: 1, ease: "inOut" },
        { t: 11.2, v: 1 },
        { t: 11.6, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      { t: 0, id: "word-lands", note: "“once” slides onto the rail", focus: "rail" },
      { t: 0.9, id: "bars-rise", note: "bars rise to the real counts after “once”", focus: "bars" },
      {
        t: 2.5,
        id: "top-flash",
        note: "the tallest bar, “upon”, lights up: the pick",
        focus: "bars",
        tint: "focus",
      },
      {
        t: 4.6,
        id: "next-word",
        note: "“upon” replaces “once” on the rail; its bar stays lit",
        focus: "rail",
      },
      {
        t: 7.4,
        id: "bars-rise-again",
        note: "bars rise for “upon”: “a” is nearly all of it",
        focus: "bars",
      },
      {
        t: 8.7,
        id: "pick-again",
        note: "“a” lights up and takes the rail: the same rule again",
        focus: "bars",
        tint: "focus",
      },
      { t: 11.6, id: "bars-for-a", note: "bars for “a”: many words, none certain", focus: "bars" },
      { t: 13.8, id: "unseen-word", note: "a misspelt “onse” lands", focus: "rail" },
      { t: 14.7, id: "no-bars", note: "no bars rise: the machine never saw “onse”", focus: "bars" },
      { t: 17.8, id: "reset", note: "the card leaves; the loop starts again", focus: "rail" },
    ],
  },
  shot: "bench-close",
  // TinyStories is credited once, by the help panel itself, for every chapter.
  help: { sources: [] },
  ogTimeSec: 4,
};
