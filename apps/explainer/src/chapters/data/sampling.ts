/**
 * Chapter 3: output and sampling, as a loaded die (the `embed` model's output half). The word
 * on the card is scored against every word in the vocabulary; the top six scores and “every
 * other word” become the faces of a barrel die, each as wide as its probability; the die rolls
 * and lands on a face drawn from a seeded generator (`sample()`); the temperature demo runs
 * cold → hot. The failure the next chapter fixes: two different stories that end in “it” roll
 * exactly the same die, because the model only looks one word back.
 */
import type { ChapterDef } from "../types.ts";

export const sampling: ChapterDef = {
  slug: "sampling",
  title: "Output and sampling",
  why: "Chapter 2 gave every word a place, but no guess. Now score every word, then roll for one.",
  model: "embed",
  scene: "sampling",
  caption: {
    default: {
      story: [
        "The word on the card scores every word in the vocabulary, and the scores load a die: likely words get wide faces.",
        "The machine rolls it, and the face that lands is the next word, so the same start can end differently.",
      ],
      precisely:
        "Each score (logit) is the dot product of the current word's vector with every word's output vector. Softmax turns scores into probabilities, and sampling draws one word in proportion to them.",
    },
    byFollow: {
      scores: {
        story: [
          "Each bar is one word's score: how well its arrow lines up with the arrow of the word on the card.",
          "The six tallest bars become the die's word faces; every other word shares the last face.",
        ],
        precisely:
          "A score is a dot product with a row of the output table (the unembedding). Bars show the highest scores of the whole vocabulary, measured up from its average score.",
      },
      die: {
        story: [
          "Each face is as wide around the rim as its word's chance, so a wide face comes up often.",
          "The temperature slider loads the die: cold makes the favourite face swallow the rim, hot spreads the odds over every word.",
        ],
        precisely:
          "Probabilities are softmax(scores ÷ temperature); temperature 0 always picks the top word. The roll stops at a uniformly random angle, which lands on each face exactly as often as its share.",
      },
      word: {
        story: [
          "Type a sentence and only its last word goes on the card: the machine sees nothing before it.",
          "Two different stories that end in the same word roll exactly the same die.",
        ],
        precisely:
          "This tiny model has no attention: its prediction depends on the last token alone, so every prompt ending in the same token gives identical probabilities.",
      },
    },
  },
  stats: [
    {
      id: "top-share",
      label: "top guess's chance, common openings",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "sampling-peaked" },
    },
    {
      id: "faces",
      label: "faces on the whole die",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "vocabSize" },
    },
    {
      id: "llama-faces",
      label: "faces on the whole die",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "vocab", args: {} },
    },
  ],
  follow: [
    { id: "scores", label: "Scores", anchor: "scores" },
    { id: "die", label: "Die", anchor: "die" },
    { id: "word", label: "Your text", anchor: "word" },
  ],
  slider: { id: "temperature", label: "Temperature", min: 0, max: 2, step: 0.1, initial: 1 },
  scenarios: [
    {
      id: "lots",
      label: "a big room with lots",
      prompt: "Once upon a time, there was a big room with lots",
      probe: "sampling-peaked",
    },
    {
      id: "timmy",
      label: "Timmy wanted",
      prompt: "One day, a little boy named Timmy wanted",
      probe: "sampling-peaked",
    },
    {
      id: "play",
      label: "liked to play in the",
      prompt: "Lila and Tom were friends who liked to play in the",
      probe: "temperature-entropy",
    },
  ],
  views: ["whole"],
  labels: [
    { anchor: "die", analogy: "The loaded die", precise: "Next-token distribution" },
    { anchor: "scores", analogy: "How well each word lines up", precise: "Logits (the highest)" },
    { anchor: "word", analogy: "The only word it sees", precise: "Last token" },
  ],
  loop: {
    durationSec: 26,
    inputs: [
      "Once upon a time, there",
      "The cat sat on the mat. Then it",
      "The dog ran away. Then it",
    ],
    channels: {
      input: [
        { t: 0, v: 0, ease: "step" },
        { t: 16, v: 1, ease: "step" },
        { t: 20.6, v: 2, ease: "step" },
      ],
      /** The score bars rise. */
      bars: [
        { t: 0, v: 0 },
        { t: 0.3, v: 0 },
        { t: 2.2, v: 1, ease: "inOut" },
        { t: 25.2, v: 1 },
        { t: 25.9, v: 0, ease: "inOut" },
      ],
      /** The top six bars light up: they become the faces. */
      glow: [
        { t: 0, v: 0 },
        { t: 2.4, v: 0 },
        { t: 3, v: 1, ease: "inOut" },
        { t: 4.6, v: 1 },
        { t: 5.2, v: 0, ease: "inOut" },
      ],
      /** The die grows out of them. */
      form: [
        { t: 0, v: 0 },
        { t: 3, v: 0 },
        { t: 4.2, v: 1, ease: "inOut" },
        { t: 25.2, v: 1 },
        { t: 25.9, v: 0, ease: "inOut" },
      ],
      /** Each unit is one roll: it tumbles, slows and lands. */
      roll: [
        { t: 0, v: 0 },
        { t: 4.4, v: 0 },
        { t: 7.2, v: 1 },
        { t: 16.4, v: 1 },
        { t: 18.8, v: 2 },
        { t: 21, v: 2 },
        { t: 23.4, v: 3 },
        { t: 25.9, v: 3 },
        { t: 25.95, v: 0, ease: "step" },
      ],
      /** The loop's cold → hot demo (the reader's slider takes over once touched). */
      temperature: [
        { t: 0, v: 1 },
        { t: 9.4, v: 1 },
        { t: 11, v: 0.2, ease: "inOut" },
        { t: 11.8, v: 0.2 },
        { t: 13.6, v: 2, ease: "inOut" },
        { t: 14.4, v: 2 },
        { t: 15.6, v: 1, ease: "inOut" },
      ],
      landed: [
        { t: 0, v: 0, ease: "step" },
        { t: 7.2, v: 1, ease: "step" },
        { t: 9.4, v: 0, ease: "step" },
        { t: 18.8, v: 1, ease: "step" },
        { t: 21, v: 0, ease: "step" },
      ],
      tempNote: [
        { t: 0, v: 0, ease: "step" },
        { t: 9.4, v: 1, ease: "step" },
        { t: 15.8, v: 0, ease: "step" },
      ],
      failure: [
        { t: 0, v: 0, ease: "step" },
        { t: 23.4, v: 1, ease: "step" },
        { t: 25.9, v: 0, ease: "step" },
      ],
    },
    beats: [
      {
        t: 0,
        id: "scores",
        note: "“there” is scored against every word: the bars rise",
        focus: "scores",
      },
      {
        t: 2.4,
        id: "faces",
        note: "the six highest scores light up and grow into a loaded die",
        focus: "die",
      },
      {
        t: 4.4,
        id: "roll",
        note: "the die tumbles and lands on a face: the next word",
        focus: "die",
        tint: "focus",
      },
      {
        t: 9.4,
        id: "temperature",
        note: "temperature goes cold (one face swallows the rim), then hot (the favourite shrinks and every other word takes over)",
        focus: "die",
      },
      { t: 16, id: "story-a", note: "“The cat sat on the mat. Then it”: roll", focus: "word" },
      {
        t: 20.6,
        id: "story-b",
        note: "“The dog ran away. Then it”: the very same die",
        focus: "word",
      },
      {
        t: 23.4,
        id: "failure",
        note: "only “it” counts: every story ending in it rolls this die",
        focus: "word",
        tint: "focus",
      },
    ],
  },
  shot: "die-table",
  // TinyStories is credited once, by the help panel itself, for every chapter.
  help: {
    sources: [],
    notes: [
      "The die's faces are the six most likely next words and one face for every other word, each exactly as wide around the rim as its probability at the temperature shown. Each roll stops at an angle drawn from a seeded random generator, so it lands on each face as often as that face's share.",
    ],
  },
  ogTimeSec: 8,
};
