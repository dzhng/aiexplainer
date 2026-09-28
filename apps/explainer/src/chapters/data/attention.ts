/**
 * Chapter 4: attention, as water pipes that open wider on a match. The example is name recall
 * (README human note): the one-layer `attn` model does not send a pronoun's attention to its
 * character, but from a point where the character's name comes next it does reach back to the
 * name's earlier mention (the `recall-attention` probe). So the scenarios are the attention
 * prompts measured into `public/models/attn/scenarios.json`, and nothing here claims a pronoun
 * finds its referent.
 */
import type { ChapterDef, ScenarioDef } from "../types.ts";

/** The name-recall prompts, exactly as measured into the `attn` model's scenarios. */
export const RECALL_PROMPTS = {
  mia: "Once upon a time, there was a little girl named Mia. She had a toy car that she loved very much. The car was not shiny and new, it looked dull, but",
  leo: "Once upon a time, in a small stable, there lived a baby lion named Leo. Leo had a big roar for such a little lion. He liked to play with his friends, but sometimes it was difficult for them because",
  ducky:
    'Once upon a time, in an ordinary town, there lived a little duck named Ducky. Ducky had a very long neck, and all the other ducks would laugh at him. They would say, "Look at',
} as const;

/**
 * The order probe's pair, as measured into the `attn` model's scenarios: the same words with
 * "dog" and "cat" swapped and the last words fixed (D35). This model's guess is identical.
 */
export const ORDER_PROMPTS = [
  "The dog chased the cat. Then the",
  "The cat chased the dog. Then the",
] as const;

const scenarios: ScenarioDef[] = [
  { id: "mia", label: "Mia's toy car", prompt: RECALL_PROMPTS.mia, probe: "recall-attention" },
  { id: "leo", label: "Leo the lion", prompt: RECALL_PROMPTS.leo, probe: "recall-attention" },
  { id: "ducky", label: "Ducky's neck", prompt: RECALL_PROMPTS.ducky, probe: "recall-attention" },
];

export const attention: ChapterDef = {
  slug: "attention",
  title: "Attention",
  why: "So far the machine only ever sees the last word, so it can't look back at a name from earlier in the story.",
  model: "attn",
  scene: "attention",
  caption: {
    default: {
      story: [
        "Every word so far has a pipe into the last word; the better a word matches what it is looking for, the wider its pipe.",
        "In Mia's story the widest pipe runs back to her name; shuffle a short sentence and its pipes just trade places.",
      ],
      technical:
        "Attention: the last token asks a question (its query), every token offers a label (its key), and their dot products, through a softmax, become weights that add up to 1. Each pipe's width is one weight of this tiny one-layer model. Weights show what a word draws from; they are not proof of meaning.",
    },
    byFollow: {
      pipes: {
        story: [
          "A pipe's width is how much the last word draws from the word the pipe comes from.",
          "All the pipes together always carry exactly one full share, so a wide pipe leaves less for the rest.",
        ],
        technical:
          "Pipe width = the attention weight softmax(q·k/√d) for that position, from layer 0 of this tiny model; the weights over every position sum to 1.",
      },
      mix: {
        story: [
          "What flows up the pipes is a blend of the words, each in proportion to its pipe.",
          "The last word's block ends up carrying some of “Mia” with it, even though “Mia” was many words back.",
        ],
        technical:
          "The mix is the weighted sum of every position's value vector, using the attention weights; it is added to the last token's own vector (the residual stream).",
      },
      sealed: {
        story: [
          "The words after “but” are the ones this machine goes on to write, and their pipes are capped shut.",
          "A word may only draw on the words before it: you can't read tomorrow's newspaper.",
        ],
        technical:
          "The causal mask: before the softmax, every score for a later position is set to minus infinity, so its weight is exactly 0. The dim words are this tiny model's own next four guesses.",
      },
    },
  },
  stats: [
    {
      id: "recall",
      label: "pull toward the earlier name",
      format: "x",
      scale: "this tiny model",
      value: { kind: "probe", probe: "recall-attention" },
    },
    {
      id: "tokens-read",
      label: "tokens read while training",
      format: "int",
      scale: "TinyStories",
      value: { kind: "model", metric: "training.tokensSeen" },
    },
    {
      id: "shuffle",
      label: "change when earlier words shuffle",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "order-invariance" },
    },
  ],
  follow: [
    { id: "pipes", label: "Pipes", anchor: "pipes" },
    { id: "mix", label: "The mix", anchor: "mix" },
    { id: "sealed", label: "Sealed", anchor: "sealed" },
  ],
  slider: { id: "shares", label: "Pipe shares shown", min: 0, max: 5, step: 1, initial: 3 },
  scenarios,
  views: ["whole", "exploded"],
  labels: [
    { anchor: "sentence", analogy: "The story so far", technical: "Tokens in context" },
    { anchor: "pipes", analogy: "Wider pipe, more drawn", technical: "Attention weight (width)" },
    { anchor: "mix", analogy: "The last word's mix", technical: "Weighted sum of values" },
    { anchor: "sealed", analogy: "Later words: sealed", technical: "Causal mask: weight 0" },
  ],
  loop: {
    durationSec: 30,
    // Name recall first; then the failure: the same short sentence twice, "dog" and "cat"
    // swapped, the last words fixed.
    inputs: [RECALL_PROMPTS.mia, ...ORDER_PROMPTS],
    channels: {
      /** Which input the scene shows: the recall story, then the two orders. */
      step: [
        { t: 0, v: 0, ease: "step" },
        { t: 14.4, v: 1, ease: "step" },
        { t: 20.8, v: 2, ease: "step" },
      ],
      /** Word blocks rise out of their steps line by line, and sink between stories. */
      blocks: [
        { t: 0, v: 0 },
        { t: 2, v: 1 },
        { t: 13.2, v: 1 },
        { t: 14.2, v: 0, ease: "inOut" },
        { t: 14.6, v: 0 },
        { t: 15.6, v: 1, ease: "inOut" },
        { t: 28.4, v: 1 },
        { t: 29.4, v: 0, ease: "inOut" },
      ],
      /** Hairline pipes reach up from each word in reading order. */
      pipes: [
        { t: 0, v: 0 },
        { t: 2.2, v: 0 },
        { t: 4.6, v: 1 },
        { t: 13.4, v: 1 },
        { t: 13.5, v: 0, ease: "step" },
        { t: 15.8, v: 0 },
        { t: 17, v: 1 },
        { t: 20.6, v: 1 },
        { t: 20.7, v: 0, ease: "step" },
        { t: 22.3, v: 0 },
        { t: 22.4, v: 1, ease: "step" },
        { t: 28.6, v: 1 },
        { t: 28.7, v: 0, ease: "step" },
      ],
      /** Pipe widths: 0 hairline, 1 the real attention weights. */
      settle: [
        { t: 0, v: 0 },
        { t: 4.8, v: 0 },
        { t: 7.2, v: 1, ease: "inOut" },
        { t: 12.6, v: 1 },
        { t: 13.4, v: 0, ease: "inOut" },
        { t: 17, v: 0 },
        { t: 18.2, v: 1, ease: "inOut" },
        { t: 19.8, v: 1 },
        { t: 20.6, v: 0, ease: "inOut" },
        { t: 22.4, v: 0 },
        { t: 23.6, v: 1, ease: "inOut" },
        { t: 27.8, v: 1 },
        { t: 28.6, v: 0, ease: "inOut" },
      ],
      /** The mix block lights as the blend arrives. */
      fill: [
        { t: 0, v: 0 },
        { t: 7.2, v: 0 },
        { t: 8.6, v: 1, ease: "inOut" },
        { t: 12.6, v: 1 },
        { t: 13.4, v: 0, ease: "inOut" },
        { t: 18.2, v: 0 },
        { t: 19, v: 1, ease: "inOut" },
        { t: 27.8, v: 1 },
        { t: 28.6, v: 0, ease: "inOut" },
      ],
      /** Pulses of light run up the pipes into the mix. */
      flow: [
        { t: 0, v: 0 },
        { t: 7.2, v: 0 },
        { t: 8.2, v: 1, ease: "inOut" },
        { t: 12.6, v: 1 },
        { t: 13.4, v: 0, ease: "inOut" },
        { t: 18.2, v: 0 },
        { t: 19, v: 1, ease: "inOut" },
        { t: 20, v: 1 },
        { t: 20.6, v: 0, ease: "inOut" },
        { t: 23.6, v: 0 },
        { t: 24.4, v: 1, ease: "inOut" },
        { t: 27.8, v: 1 },
        { t: 28.6, v: 0, ease: "inOut" },
      ],
      /** The mix's needle stands up once the mix is lit, for the recall story only. */
      needle: [
        { t: 0, v: 0, ease: "step" },
        { t: 8.6, v: 1, ease: "step" },
        { t: 13.2, v: 0, ease: "step" },
      ],
      /** The mix's needle tilts toward the word it drew the most from. */
      turn: [
        { t: 0, v: 0 },
        { t: 9.2, v: 0 },
        { t: 10.4, v: 1, ease: "inOut" },
        { t: 12.6, v: 1 },
        { t: 13.2, v: 0, ease: "inOut" },
      ],
      /** The words after "but" rise with their capped, sealed stubs. */
      future: [
        { t: 0, v: 0 },
        { t: 10.8, v: 0 },
        { t: 11.8, v: 1, ease: "inOut" },
        { t: 12.8, v: 1 },
        { t: 13.4, v: 0, ease: "inOut" },
      ],
      /** "dog" and "cat" move to each other's places. */
      swap: [
        { t: 0, v: 1 },
        { t: 20.8, v: 0, ease: "step" },
        { t: 22.2, v: 1, ease: "inOut" },
      ],
      /** The next-word guess shows over the mix, and stays up through the swap. */
      guess: [
        { t: 0, v: 0, ease: "step" },
        { t: 18.4, v: 1, ease: "step" },
        { t: 28.4, v: 0, ease: "step" },
      ],
      /** The note: same mix, same guess. */
      lost: [
        { t: 0, v: 0, ease: "step" },
        { t: 24.2, v: 1, ease: "step" },
        { t: 28.4, v: 0, ease: "step" },
      ],
    },
    beats: [
      {
        t: 0,
        id: "words",
        note: "the story rises as word blocks, line by line",
        focus: "sentence",
      },
      {
        t: 2.2,
        id: "pipes-grow",
        note: "a hairline pipe reaches up from every word into the last word, “but”",
        focus: "pipes",
      },
      {
        t: 4.8,
        id: "widths-settle",
        note: "each pipe opens to its real attention weight: “Mia” is widest",
        focus: "pipes",
        tint: "flow",
      },
      {
        t: 7.2,
        id: "flow",
        note: "pulses carry the blend up the pipes, the wide ones brightest, into the mix",
        focus: "mix",
        tint: "flow",
      },
      {
        t: 9.2,
        id: "turn",
        note: "the mix's needle tips toward “Mia”: the real turn of “but”'s vector",
        focus: "mix",
        tint: "focus",
      },
      {
        t: 10.8,
        id: "sealed",
        note: "the words the model writes next rise, their pipes capped: it can't read ahead",
        focus: "sealed",
        tint: "sealed",
      },
      {
        t: 13.2,
        id: "short-story",
        note: "the story clears; “The dog chased the cat. Then the” takes its place",
        focus: "sentence",
      },
      {
        t: 17,
        id: "order-a",
        note: "its pipes open and the mix shows the model's next-word guess",
        focus: "mix",
      },
      {
        t: 20.6,
        id: "shuffle",
        note: "“dog” and “cat” swap places; the last words stay put",
        focus: "sentence",
      },
      {
        t: 22.4,
        id: "order-lost",
        note: "the pipes rearrange, but the mix and the guess are identical: order is lost",
        focus: "mix",
        tint: "focus",
      },
      { t: 28.4, id: "drain", note: "the words sink; the loop starts again", focus: "sentence" },
    ],
  },
  shot: "attention-hero",
  help: {
    sources: [{ label: "Vaswani et al. 2017, attention", url: "https://arxiv.org/abs/1706.03762" }],
  },
  ogTimeSec: 12.2,
};
