/**
 * Chapter 0: next-word guessing from word-pair counts. Draft copy and loop; slice 11
 * finalises both, and picks the example words from the `counts` probe (O2).
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
        "Your phone's autocomplete guesses your next word, and the simplest way to do that is to remember which words usually come next.",
        "This machine read a big pile of children's stories and kept a tally for every pair of words that sat side by side.",
      ],
      precisely:
        "For each word, the model counts how often every other word came right after it in TinyStories, then divides by the row total to get next-word probabilities.",
    },
    byFollow: {
      counts: {
        story: [
          "Each row of the board belongs to one word, and each mark on the row records one time another word followed it.",
          "Nothing here understands the words; it only remembers what came next.",
        ],
        precisely:
          "Row w holds count(w, x) for the most frequent successors x of w, stored as whole numbers.",
      },
      next: {
        story: [
          "The bars are the tallies for the word on the rail, turned into chances that add up to one.",
          "The machine picks the tallest bar, puts that word on the rail, and does it all again.",
        ],
        precisely:
          "p(x | w) = count(w, x) / Σ count(w, ·); the loop takes the most likely x each step (greedy).",
      },
      text: {
        story: [
          "The machine only ever looks at the last word on the rail, however long your sentence is.",
          "Type a word it has never seen, and there is no row to read, so no bars appear.",
        ],
        precisely:
          "The context is exactly one word; a word with no counts has no prediction at all.",
      },
    },
  },
  stats: [
    {
      id: "words-counted",
      label: "words counted",
      format: "int",
      scale: "TinyStories",
      value: { kind: "model", metric: "tokensSeen" },
    },
    {
      id: "distinct-words",
      label: "distinct words",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "vocabSize" },
    },
    {
      id: "top-chance",
      label: "chance of the top next word",
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
    { anchor: "board", analogy: "The tally book", precise: "Word-pair count table" },
    {
      anchor: "bars",
      analogy: "How often each word came next",
      precise: "p(next word | this word)",
    },
    { anchor: "rail", analogy: "What you've typed", precise: "Context: the last word only" },
  ],
  loop: {
    durationSec: 24,
    channels: {
      /** Which word is on the rail: 0 the first word, 1 the chosen next word, 2 an unseen word. */
      railWord: [
        { t: 0, v: 0, ease: "step" },
        { t: 7, v: 1, ease: "step" },
        { t: 13, v: 2, ease: "step" },
      ],
      /** 0 → 1 as the newest word slides onto the rail. */
      railSlide: [
        { t: 0, v: 0, ease: "step" },
        { t: 1.2, v: 1, ease: "inOut" },
        { t: 7, v: 0, ease: "step" },
        { t: 8.2, v: 1, ease: "inOut" },
        { t: 13, v: 0, ease: "step" },
        { t: 14.2, v: 1, ease: "inOut" },
      ],
      /** Bar height as a fraction of each bar's real probability. */
      bars: [
        { t: 0, v: 0, ease: "step" },
        { t: 2.5, v: 0 },
        { t: 4.5, v: 1, ease: "inOut" },
        { t: 7, v: 1 },
        { t: 7.5, v: 0, ease: "inOut" },
        { t: 9.5, v: 0 },
        { t: 11.5, v: 1, ease: "inOut" },
        { t: 13, v: 1 },
        { t: 13.5, v: 0, ease: "inOut" },
      ],
      /** Glow on the tallest bar. */
      topFlash: [
        { t: 0, v: 0 },
        { t: 5, v: 0 },
        { t: 5.4, v: 1, ease: "inOut" },
        { t: 6.4, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      { t: 0, id: "word-lands", note: "the first word lands on the rail", focus: "rail" },
      {
        t: 2.5,
        id: "bars-rise",
        note: "count bars rise to the real successor counts",
        focus: "bars",
      },
      { t: 5, id: "top-flash", note: "the tallest bar flashes", focus: "bars", tint: "focus" },
      { t: 7, id: "next-word", note: "the chosen word slides onto the rail", focus: "rail" },
      { t: 9.5, id: "bars-rise-again", note: "bars rise for the new word", focus: "bars" },
      { t: 13, id: "unseen-word", note: "an unseen word lands: no bars appear", focus: "rail" },
    ],
  },
  shot: "bench-close",
  help: {
    sources: [
      {
        label: "TinyStories (CDLA-Sharing-1.0)",
        url: "https://huggingface.co/datasets/roneneldan/TinyStories",
      },
    ],
  },
  ogTimeSec: 5.4,
};
