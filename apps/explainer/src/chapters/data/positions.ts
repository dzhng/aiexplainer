/**
 * Chapter 5: positions (RoPE), as a clock hand on every word, turned by its place in the
 * sentence. The loop replays chapter 4's shuffle on the one-layer `rope` model: the same words
 * with "dog" and "cat" swapped now give different pipes and a different guess. The two orders
 * are a pair measured into `public/models/rope/scenarios.json` (the order-sensitivity probe),
 * and each is a Try chip, so the reader can flip between them.
 */
import type { ChapterDef, ScenarioDef } from "../types.ts";
import { ORDER_PROMPTS } from "./attention.ts";

const [dogFirst, catFirst] = ORDER_PROMPTS;
const scenarios: ScenarioDef[] = [
  { id: "dog-cat", label: "Dog chased cat", prompt: dogFirst, probe: "order-sensitivity" },
  { id: "cat-dog", label: "Cat chased dog", prompt: catFirst, probe: "order-sensitivity" },
];

export const positions: ChapterDef = {
  slug: "positions",
  title: "Word order",
  why: "Chapter 4's machine gave “the dog chased the cat” and “the cat chased the dog” the very same guess.",
  model: "rope",
  scene: "positions",
  caption: {
    story: [
      "Now every word carries a clock hand, turned a little further for each place it sits along the sentence.",
      "Swap two words and their hands swap angles too, so the pipes and the guess both change.",
    ],
    technical:
      "RoPE (rotary position embedding): before the dot products, each query and key is rotated pair by pair by an angle proportional to its position, so a score depends on how far apart two words are. A hand shows one pair's real angle in this tiny model: position × 10000^(−10/96), about 22° per word. With one attention layer and no positions, shuffling the earlier words doesn't change the prediction; with RoPE it does.",
  },
  brief: [
    "Chapter 4's machine gave the same guess however the words were ordered.",
    "This lesson gives every word a clock hand, turned further for each place it sits along the sentence.",
    "Watch two words swap places, and the pipes and the guess change with them.",
  ],
  stats: [
    {
      id: "order-change",
      label: "how much a word swap moves the guess",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "order-sensitivity" },
    },
    {
      id: "tokens-read",
      label: "tokens read while training",
      format: "int",
      scale: "TinyStories",
      value: { kind: "model", metric: "training.tokensSeen" },
    },
    {
      id: "vocab",
      label: "pieces it knows",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "vocabSize" },
    },
  ],
  scenarios,
  labels: [
    { anchor: "sentence", analogy: "The story so far", technical: "Tokens in context" },
    { anchor: "dials", analogy: "Clock hand: its place", technical: "RoPE angle, one pair" },
    { anchor: "pipes", analogy: "Wider pipe, more drawn", technical: "Attention weight (width)" },
    { anchor: "mix", analogy: "The last word's mix", technical: "Weighted sum of values" },
  ],
  loop: {
    durationSec: 24,
    endSec: 22,
    inputs: [...ORDER_PROMPTS],
    channels: {
      /** Which order the scene shows. */
      step: [
        { t: 0, v: 0, ease: "step" },
        { t: 11.2, v: 1, ease: "step" },
      ],
      /** Word blocks rise out of their step, and sink at the seam. */
      blocks: [
        { t: 0, v: 0 },
        { t: 1.4, v: 1, ease: "inOut" },
        { t: 22.6, v: 1 },
        { t: 23.7, v: 0, ease: "inOut" },
      ],
      /**
       * Clock hands come round from twelve to their positions' angles. At the seam they ride
       * their blocks down into the stand, and only reset once out of sight (no unwinding).
       */
      dial: [
        { t: 0, v: 0 },
        { t: 1.6, v: 0 },
        { t: 3.4, v: 1, ease: "inOut" },
        { t: 23.7, v: 1 },
        { t: 23.75, v: 0, ease: "step" },
      ],
      pipes: [
        { t: 0, v: 0 },
        { t: 3.6, v: 0 },
        { t: 4.8, v: 1 },
        { t: 10.9, v: 1 },
        { t: 11, v: 0, ease: "step" },
        { t: 12.7, v: 0 },
        { t: 12.8, v: 1, ease: "step" },
        { t: 22.6, v: 1 },
        { t: 22.7, v: 0, ease: "step" },
      ],
      settle: [
        { t: 0, v: 0 },
        { t: 5, v: 0 },
        { t: 6.4, v: 1, ease: "inOut" },
        { t: 10.2, v: 1 },
        { t: 10.9, v: 0, ease: "inOut" },
        { t: 12.8, v: 0 },
        { t: 14, v: 1, ease: "inOut" },
        { t: 22, v: 1 },
        { t: 22.6, v: 0, ease: "inOut" },
      ],
      fill: [
        { t: 0, v: 0 },
        { t: 6.4, v: 0 },
        { t: 7.2, v: 1, ease: "inOut" },
        { t: 22, v: 1 },
        { t: 22.6, v: 0, ease: "inOut" },
      ],
      flow: [
        { t: 0, v: 0 },
        { t: 6.6, v: 0 },
        { t: 7.4, v: 1, ease: "inOut" },
        { t: 10.2, v: 1 },
        { t: 10.9, v: 0, ease: "inOut" },
        { t: 14, v: 0 },
        { t: 14.8, v: 1, ease: "inOut" },
        { t: 22, v: 1 },
        { t: 22.6, v: 0, ease: "inOut" },
      ],
      /** No needle and no sealed words in this chapter. */
      needle: [{ t: 0, v: 0 }],
      future: [{ t: 0, v: 0 }],
      swap: [
        { t: 0, v: 1 },
        { t: 11.2, v: 0, ease: "step" },
        { t: 12.6, v: 1, ease: "inOut" },
      ],
      /** The guess shows for each order once its pipes are open, and hides during the swap. */
      guess: [
        { t: 0, v: 0, ease: "step" },
        { t: 7.2, v: 1, ease: "step" },
        { t: 10.9, v: 0, ease: "step" },
        { t: 14, v: 1, ease: "step" },
        { t: 22.4, v: 0, ease: "step" },
      ],
      /** The two swapped words' hands glow, with their angle apart. */
      pair: [
        { t: 0, v: 0, ease: "step" },
        { t: 8, v: 1, ease: "step" },
        { t: 13.6, v: 0, ease: "step" },
      ],
      /** The note: a different order, a different guess. */
      lost: [
        { t: 0, v: 0, ease: "step" },
        { t: 14.4, v: 1, ease: "step" },
        { t: 17.8, v: 0, ease: "step" },
      ],
      /** The failure: the mix is only an average. */
      average: [
        { t: 0, v: 0, ease: "step" },
        { t: 18, v: 1, ease: "step" },
        { t: 22.4, v: 0, ease: "step" },
      ],
    },
    beats: [
      {
        t: 0,
        id: "words",
        note: "chapter 4's sentence again: “The dog chased the cat. Then the”",
        focus: "sentence",
      },
      {
        t: 1.6,
        id: "hands",
        note: "a clock hand on every word comes round to its place: about 22° a word",
        focus: "dials",
        tint: "focus",
      },
      {
        t: 3.6,
        id: "pipes",
        note: "the pipes open to the rope model's real weights; the guess shows",
        focus: "pipes",
      },
      {
        t: 8,
        id: "pair",
        note: "“dog” and “cat” light up: 3 places apart, their hands 66° apart",
        focus: "dials",
        tint: "focus",
      },
      {
        t: 11.2,
        id: "swap",
        note: "“dog” and “cat” swap places, and their hands turn to their new places",
        focus: "dials",
      },
      {
        t: 12.8,
        id: "differ",
        note: "the pipes open differently and the guess changes: order now matters",
        focus: "mix",
        tint: "focus",
      },
      {
        t: 18,
        id: "average",
        note: "but the mix is still just a weighted average: nothing thinks about it yet",
        focus: "mix",
      },
      { t: 22.4, id: "drain", note: "the words sink; the loop starts again", focus: "sentence" },
    ],
  },
  shot: "attention-hero",
  help: {
    sources: [{ label: "Su et al. 2021, RoPE", url: "https://arxiv.org/abs/2104.09864" }],
  },
  ogTimeSec: 9,
};
