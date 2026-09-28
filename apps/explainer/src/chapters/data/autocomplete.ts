/**
 * The intro (display number 0, shown as "Intro"): the job every model in the series does,
 * guessing the next word, done the simplest way, from word-pair counts. It frames the deep
 * dive rather than starting it. The example words come from the `counts` model itself: "upon"
 * is its top next word after "once", its top-successor probe measures "a" after "upon", and
 * "onse" is a misspelling it never kept. The loop shows the rule twice (once → upon → a), then
 * the failure that chapter 1 fixes. The loop's inputs are whole texts, like the reader's: the
 * rail shows each, and the machine looks only at its last word.
 */
import type { ChapterDef } from "../types.ts";

export const autocomplete: ChapterDef = {
  slug: "autocomplete",
  title: "The job: guess the next word",
  why: "Every model in this series does one thing: guess the next word. Here's the simplest possible way.",
  model: "counts",
  scene: "autocomplete",
  caption: {
    story: [
      "Like your phone's keyboard, the simplest first try just remembers which word usually came next, tallied from millions of children's stories.",
      "It stalls on any word it never saw, like “onse”, and the deep dive starts in chapter 1 by fixing that.",
    ],
    technical:
      "For each word it knows, this tiny model keeps the 20 words that most often came right after it in TinyStories; each bar is one word's share of those kept counts. It reads only the last word, so a word outside its vocabulary has no counts and no prediction.",
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
  scenarios: [{ id: "once", label: "Once upon a", prompt: "once upon a", probe: "top-successor" }],
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
