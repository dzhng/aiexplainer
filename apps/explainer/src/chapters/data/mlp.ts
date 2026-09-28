/**
 * Chapter 6: the MLP as a panel of yes/no questions. The loop's prompt is the `mlp` probe's
 * best example ("Once upon a … time": p 1.000 → 0.012 with its 16 most active neurons off);
 * the scenarios are the probe's next two. The failure beat teases chapter 7 with the
 * `noresidual` model's real, vanishing stream.
 */
import type { ChapterDef } from "../types.ts";

export const mlp: ChapterDef = {
  slug: "mlp",
  title: "A panel of yes/no questions",
  why: "Attention moved clues from word to word, but nothing yet works anything out from them.",
  model: "mlp",
  scene: "mlp",
  caption: {
    default: {
      story: [
        "Attention hands each word an arrow of gathered clues, and next it passes a panel of yes/no questions, the model's neurons.",
        "Each question that answers yes lights up and pushes the arrow toward the words that should come next.",
      ],
      precisely:
        "This is the MLP (multilayer perceptron): each neuron scores the arrow with silu(w1·x)·(w3·x), and w2 adds every neuron's own direction, scaled by its score, back onto the arrow. A lot of what the model knows is stored here.",
    },
    byFollow: {
      panel: {
        story: [
          "Each lamp is one question, and its brightness is how strongly the arrow answered it.",
          "Nobody wrote these questions; training found them, so most don't match any one idea we could name.",
        ],
        precisely:
          "Lamp brightness is |activation| of this tiny model's most active neurons at the last word (the slider sets how many); the rest of the panel is not drawn.",
      },
      arrow: {
        story: [
          "The arrow is everything the machine has worked out so far about the last word and the words before it.",
          "Each push adds to the arrow instead of replacing it, so what attention gathered is still there afterwards.",
        ],
        precisely:
          "The arrow is the last token's vector. The MLP's output is added onto it, and each pipe's width is how much that one neuron raises or lowers the answer's logit.",
      },
      readout: {
        story: [
          "The bars show how sure the machine is of its next word with the brightest lamps off, then with every lamp on.",
          "A lot of what the model knows is stored here: switch a few questions off and its best guess collapses.",
        ],
        precisely:
          "p(next token) from this tiny model with its 16 most active neurons zeroed, then with none zeroed; the chip repeats that test over 30 fact-like prompts.",
      },
    },
  },
  stats: [
    {
      id: "questions",
      label: "yes/no questions per block",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "mlpNeurons" },
    },
    {
      id: "top-off",
      label: "right-word chance lost, top 16 off",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "mlp-neurons" },
    },
    {
      id: "llama-questions",
      label: "yes/no questions per block",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "mlpNeurons", args: {} },
    },
  ],
  follow: [
    { id: "panel", label: "Questions", anchor: "panel" },
    { id: "arrow", label: "The arrow", anchor: "arrow" },
    { id: "readout", label: "Next word", anchor: "readout" },
  ],
  slider: { id: "lamps", label: "Lamps shown", min: 4, max: 24, step: 4, initial: 24 },
  scenarios: [
    { id: "time", label: "Once upon a", prompt: "Once upon a", probe: "mlp-neurons" },
    { id: "after", label: "happily ever", prompt: "They lived happily ever", probe: "mlp-neurons" },
    { id: "book", label: "She read a", prompt: "She read a", probe: "mlp-neurons" },
  ],
  views: ["whole", "exploded"],
  labels: [
    { anchor: "panel", analogy: "Yes/no questions", precise: "MLP neurons (SwiGLU)" },
    { anchor: "arrow", analogy: "The word's arrow", precise: "Last token's vector" },
    { anchor: "readout", analogy: "How sure of the next word", precise: "p(next token)" },
  ],
  loop: {
    durationSec: 22,
    inputs: ["Once upon a"],
    channels: {
      /** The arrow slides in from the left, then out again before the seam. */
      arrowIn: [
        { t: 0, v: 0 },
        { t: 1.8, v: 1, ease: "inOut" },
        { t: 20.2, v: 1 },
        { t: 21.6, v: 0, ease: "inOut" },
      ],
      /** Lamps light most active first (linear, so they come on one after another). */
      lamps: [
        { t: 0, v: 0 },
        { t: 1.4, v: 0 },
        { t: 4.4, v: 1 },
        { t: 20, v: 1 },
        { t: 21.4, v: 0, ease: "inOut" },
      ],
      /** Push pipes reach the arrow in the same order; the arrow thickens as they land. */
      pushes: [
        { t: 0, v: 0 },
        { t: 3.4, v: 0 },
        { t: 7, v: 1 },
        { t: 20, v: 1 },
        { t: 21.4, v: 0, ease: "inOut" },
      ],
      /** The answer's chance with every lamp on… */
      onBar: [
        { t: 0, v: 0 },
        { t: 7.2, v: 0 },
        { t: 8.4, v: 1, ease: "inOut" },
        { t: 20, v: 1 },
        { t: 21.4, v: 0, ease: "inOut" },
      ],
      /** …then the 16 brightest lamps switch off, and the second bar shows what is left. */
      ablate: [
        { t: 0, v: 0 },
        { t: 9.4, v: 0 },
        { t: 10.2, v: 1, ease: "inOut" },
        { t: 12.6, v: 1 },
        { t: 13.4, v: 0, ease: "inOut" },
      ],
      offBar: [
        { t: 0, v: 0 },
        { t: 10, v: 0 },
        { t: 10.8, v: 1, ease: "inOut" },
        { t: 20, v: 1 },
        { t: 21.4, v: 0, ease: "inOut" },
      ],
      /** The failure beat: a row of four small panels, nothing else, rises in front. */
      teaser: [
        { t: 0, v: 0 },
        { t: 13.6, v: 0 },
        { t: 14.6, v: 1, ease: "inOut" },
        { t: 18.6, v: 1 },
        { t: 19.6, v: 0, ease: "inOut" },
      ],
      /** How far along that row the arrow has travelled. */
      teaserFlow: [
        { t: 0, v: 0 },
        { t: 14.6, v: 0 },
        { t: 16.6, v: 1 },
        { t: 18.6, v: 1 },
        { t: 19.6, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      { t: 0, id: "arrow-in", note: "the word's arrow slides in across the panel", focus: "arrow" },
      {
        t: 1.4,
        id: "lamps",
        note: "the most active questions light up, brightest first",
        focus: "panel",
        tint: "flow",
      },
      {
        t: 3.4,
        id: "pushes",
        note: "each lit lamp pushes onto the arrow, which thickens as the pushes add up",
        focus: "panel",
      },
      {
        t: 7.2,
        id: "with",
        note: "with every lamp on, “time” is nearly certain",
        focus: "readout",
        tint: "focus",
      },
      {
        t: 9.4,
        id: "without",
        note: "the 16 brightest lamps switch off: “time” drops to a long shot",
        focus: "readout",
      },
      {
        t: 13.6,
        id: "no-river",
        note: "four panels in a row with nothing else: the arrow dies after the first",
        focus: "teaser",
      },
      { t: 20, id: "reset", note: "lamps go dark; the loop starts again", focus: "arrow" },
    ],
  },
  shot: "mlp-panel",
  help: { sources: [{ label: "SwiGLU (Shazeer 2020)", url: "https://arxiv.org/abs/2002.05202" }] },
  ogTimeSec: 8.8,
};
