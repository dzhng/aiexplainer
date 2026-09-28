/**
 * Chapter 13: speculative decoding — the junior drafts, the senior checks. The drafter
 * (`drafter-64`, O3) guesses k words; the target (`full`) checks them all in one pass, keeps
 * each with probability min(1, p/q), and adds its own word: a correction at the first
 * rejection, or a bonus when every guess was kept. The rounds are real (`speculate`, seeded);
 * the chips are the drafter's held-out probes and Leviathan et al.'s expected words per check.
 */
import type { ChapterDef } from "../types.ts";

/** The seeded runs the scene shows (the seed was picked from 1–12, see the slice record). */
export const SPEC_RUN = { seed: 11, temperature: 1, maxNewTokens: 16, maxK: 8 } as const;
/** Rounds the loop plays. */
export const LOOP_ROUNDS = 3;

export const speculative: ChapterDef = {
  slug: "speculative",
  title: "Speculative decoding",
  why: "Lighter cargo helped, but every trip still brings back just one word.",
  model: "drafter-64",
  scene: "speculative",
  caption: {
    default: {
      story: [
        "A junior writer drafts the next few words quickly, and the senior checks the whole draft in one read.",
        "Every word the senior agrees with is kept for free, so one slow trip can bring back several words.",
      ],
      precisely:
        "Speculative decoding: a small drafter model guesses k tokens; the target model scores all of them in one forward pass and keeps each with probability min(1, p/q), so the output has exactly the target's distribution.",
    },
    byFollow: {
      junior: {
        story: [
          "The junior is a much smaller machine, so its guesses are cheap and fast.",
          "It is often right about easy words, and often wrong about surprising ones.",
        ],
        precisely:
          "The drafter is a 1-layer model with about a fifth of the target's weights; each guess is sampled from its own next-token probabilities q.",
      },
      senior: {
        story: [
          "The senior reads the junior's draft once and marks each word right or wrong, in order.",
          "At the first word it rejects it writes its own word instead, so nothing wrong ever gets through.",
        ],
        precisely:
          "Guess i is kept with probability min(1, p/q) under the target's p; at the first rejection the target samples from max(0, p − q) renormalised; if all k are kept it samples a bonus token.",
      },
      draft: {
        story: [
          "Gold words were kept, dark words were thrown away, and the blue word is the senior's own.",
          "More gold per round means fewer slow trips for the same story.",
        ],
        precisely:
          "Expected tokens per target pass are (1 − α^(k+1)) ÷ (1 − α), where α is the chance a guess is kept (Leviathan et al. 2023, Eq. 1).",
      },
    },
  },
  stats: [
    {
      id: "alpha",
      label: "guesses the senior keeps",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "draft-acceptance-heldout" },
    },
    {
      id: "per-check",
      label: "words per senior check",
      format: "num",
      scale: "this tiny model",
      value: {
        kind: "arith",
        fn: "specExpectedTokens",
        args: { alpha: { probe: "draft-acceptance-heldout" }, k: { slider: true } },
      },
    },
    {
      id: "speedup",
      label: "faster overall, drafting included",
      format: "x",
      scale: "this tiny model",
      value: { kind: "probe", probe: "draft-speedup-heldout" },
    },
  ],
  follow: [
    { id: "junior", label: "Junior", anchor: "junior" },
    { id: "senior", label: "Senior", anchor: "senior" },
    { id: "draft", label: "Draft", anchor: "draft" },
  ],
  slider: { id: "k", label: "Words drafted per round (k)", min: 1, max: 8, step: 1, initial: 4 },
  scenarios: [
    {
      id: "little",
      label: "There was a little",
      prompt: "Once upon a time, there was a little",
      probe: "draft-acceptance-heldout",
    },
  ],
  views: ["whole", "exploded"],
  labels: [
    { anchor: "junior", analogy: "The junior: drafts fast", precise: "Drafter (1 layer)" },
    { anchor: "senior", analogy: "The senior: checks in one read", precise: "Target model" },
    { anchor: "draft", analogy: "The draft, word by word", precise: "k drafted tokens" },
    { anchor: "output", analogy: "The story so far", precise: "Committed tokens" },
  ],
  loop: {
    durationSec: 24,
    inputs: ["Once upon a time, there was a little"],
    channels: {
      /** Which round is on the strip (0, 1, 2). */
      round: [
        { t: 0, v: 0, ease: "step" },
        { t: 5, v: 1, ease: "step" },
        { t: 10, v: 2, ease: "step" },
      ],
      /**
       * Where the round is: 0 → 1 as the junior drafts its k words, 1.25 when the senior's
       * verdict shows, 1.5 once the kept words join the story.
       */
      phase: [
        { t: 0, v: 0, ease: "step" },
        { t: 0.3, v: 0 },
        { t: 2.1, v: 1 },
        { t: 2.5, v: 1.25, ease: "step" },
        { t: 4.0, v: 1.5, ease: "step" },
        { t: 5, v: 0, ease: "step" },
        { t: 5.3, v: 0 },
        { t: 7.1, v: 1 },
        { t: 7.5, v: 1.25, ease: "step" },
        { t: 9.0, v: 1.5, ease: "step" },
        { t: 10, v: 0, ease: "step" },
        { t: 10.3, v: 0 },
        { t: 12.1, v: 1 },
        { t: 12.5, v: 1.25, ease: "step" },
        { t: 14.0, v: 1.5, ease: "step" },
      ],
      /** The senior's one read: a pulse while it checks the draft. */
      check: [
        { t: 0, v: 0 },
        { t: 2.0, v: 0 },
        { t: 2.3, v: 1, ease: "inOut" },
        { t: 2.8, v: 0, ease: "inOut" },
        { t: 7.0, v: 0 },
        { t: 7.3, v: 1, ease: "inOut" },
        { t: 7.8, v: 0, ease: "inOut" },
        { t: 12.0, v: 0 },
        { t: 12.3, v: 1, ease: "inOut" },
        { t: 12.8, v: 0, ease: "inOut" },
      ],
      /** The failure beat: the senior's size, every check. */
      heavy: [
        { t: 0, v: 0 },
        { t: 16.2, v: 0 },
        { t: 16.8, v: 1, ease: "inOut" },
        { t: 23.2, v: 1 },
        { t: 23.8, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      { t: 0, id: "draft", note: "the junior races ahead, drafting k = 4 words", focus: "junior" },
      { t: 2, id: "check", note: "the senior checks all 4 in one read", focus: "senior" },
      {
        t: 2.5,
        id: "verdict",
        note: "kept words turn gold; the senior adds its own word (a bonus)",
        focus: "draft",
        tint: "focus",
      },
      {
        t: 5,
        id: "round-2",
        note: "round 2: a rejection, and the senior's correction",
        focus: "draft",
      },
      { t: 10, id: "round-3", note: "round 3: rejected early, so one kept word", focus: "draft" },
      {
        t: 16.2,
        id: "heavy",
        note: "each check still runs the whole senior: a bigger model, slower per word",
        focus: "senior",
        tint: "focus",
      },
    ],
  },
  shot: "spec-desk",
  help: {
    sources: [
      {
        label: "Leviathan et al. 2023, Fast Inference from Transformers via Speculative Decoding",
        url: "https://arxiv.org/abs/2211.17192",
      },
      {
        label: "Chen et al. 2023, Accelerating LLM Decoding with Speculative Sampling",
        url: "https://arxiv.org/abs/2302.01318",
      },
    ],
  },
  ogTimeSec: 4,
};
