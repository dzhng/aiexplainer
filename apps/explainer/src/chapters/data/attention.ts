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
        "In this story the widest pipe runs all the way back to the girl's name, “Mia”.",
      ],
      precisely:
        "Attention: the last token asks a question (its query), every token offers a label (its key), and their dot products, through a softmax, become weights that add up to 1. Each pipe's cross-section area is one weight of this tiny one-layer model. Weights show what a word draws from; they are not proof of meaning.",
    },
    byFollow: {
      pipes: {
        story: [
          "A pipe's width is how much the last word draws from the word the pipe comes from.",
          "All the pipes together always carry exactly one full share, so a wide pipe leaves less for the rest.",
        ],
        precisely:
          "Pipe cross-section area = the attention weight softmax(q·k/√d) for that position, from layer 0 of this tiny model; the weights over every position sum to 1.",
      },
      mix: {
        story: [
          "What flows up the pipes is a blend of the words, each in proportion to its pipe.",
          "The last word's block ends up carrying some of “Mia” with it, even though “Mia” was many words back.",
        ],
        precisely:
          "The mix is the weighted sum of every position's value vector, using the attention weights; it is added to the last token's own vector (the residual stream).",
      },
      sentence: {
        story: [
          "Each block is one token of the story, in reading order, laid out line by line like a page.",
          "The last block, lit orange, is the word the machine is about to continue from.",
        ],
        precisely:
          "The tokens are the tokenizer's pieces of the prompt, after a start marker; the attention shown is from the last token, which is where the next-token guess is made.",
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
    { id: "sentence", label: "The words", anchor: "sentence" },
  ],
  slider: { id: "shares", label: "Pipe shares shown", min: 0, max: 5, step: 1, initial: 3 },
  scenarios,
  views: ["whole", "exploded"],
  labels: [
    { anchor: "sentence", analogy: "The story so far", precise: "Tokens in context" },
    { anchor: "pipes", analogy: "Wider pipe, more drawn", precise: "Attention weight (area)" },
    { anchor: "mix", analogy: "The last word's mix", precise: "Weighted sum of values" },
  ],
  loop: {
    durationSec: 20,
    inputs: [RECALL_PROMPTS.mia],
    channels: {
      /** Word blocks rise out of their steps, then sink back at the seam. */
      blocks: [
        { t: 0, v: 0 },
        { t: 1.2, v: 1, ease: "inOut" },
        { t: 18.3, v: 1 },
        { t: 19.4, v: 0, ease: "inOut" },
      ],
      /** Hairline pipes reach up from each word in reading order. */
      pipes: [
        { t: 0, v: 0 },
        { t: 1.4, v: 0 },
        { t: 4.2, v: 1 },
        { t: 18.4, v: 1 },
        { t: 18.6, v: 0, ease: "step" },
      ],
      /** Pipe widths: 0 hairline, 1 the real attention weights. */
      settle: [
        { t: 0, v: 0 },
        { t: 4.6, v: 0 },
        { t: 7.4, v: 1, ease: "inOut" },
        { t: 17.4, v: 1 },
        { t: 18.4, v: 0, ease: "inOut" },
      ],
      /** The mix block lights as the blend arrives. */
      fill: [
        { t: 0, v: 0 },
        { t: 7.8, v: 0 },
        { t: 9.6, v: 1, ease: "inOut" },
        { t: 17.4, v: 1 },
        { t: 18.4, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      { t: 0, id: "words", note: "the story sits as word blocks, line by line", focus: "sentence" },
      {
        t: 1.4,
        id: "pipes-grow",
        note: "a hairline pipe reaches up from every word into the last word, “but”",
        focus: "pipes",
      },
      {
        t: 4.6,
        id: "widths-settle",
        note: "each pipe opens to its real attention weight: “Mia” is widest",
        focus: "pipes",
        tint: "flow",
      },
      {
        t: 7.8,
        id: "mix-flows",
        note: "the blend flows up and the last word's block lights",
        focus: "mix",
        tint: "focus",
      },
      { t: 17.4, id: "drain", note: "the pipes close; the loop starts again", focus: "sentence" },
    ],
  },
  shot: "attention-hero",
  help: {
    sources: [{ label: "Vaswani et al. 2017, attention", url: "https://arxiv.org/abs/1706.03762" }],
  },
  ogTimeSec: 10,
};
