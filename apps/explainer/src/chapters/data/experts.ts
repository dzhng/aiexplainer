/**
 * Chapter 14: mixture of experts, hospital triage. The `moe` model's MLP is 8 experts; a
 * router sends each token to 2 of them (real router choices, from the forward trace), so the
 * work per token stays small while the model holds more. The usage histogram is the export
 * gate's evidence (each expert's share of routing slots on held-out text). No specialisation is
 * claimed: the probe found none worth naming. The production number uses the named
 * `llamaAsMoe` assumption, because Llama-3-8B is not a mixture of experts.
 */
import type { ChapterDef } from "../types.ts";

/** The layer whose router the desk shows (0-based), and how many tokens the loop routes. */
export const ROUTER_LAYER = 0;
export const ROUTED_TOKENS = 6;

export const experts: ChapterDef = {
  slug: "experts",
  title: "Mixture of experts",
  why: "A smarter machine needs more knowledge, but every extra weight made each word slower.",
  model: "moe",
  scene: "experts",
  caption: {
    story: [
      "At a hospital, a triage desk sends each patient to the right specialists, not to every doctor in the building.",
      "Here the router sends each word to 2 of 8 expert bays, so the machine holds much more than any one word pays for.",
    ],
    technical:
      "Mixture of experts: the MLP is split into 8 experts, and a small router picks the top 2 for each token, mixing their outputs by its renormalised probabilities; the other 6 do no work for that token.",
  },
  brief: [
    "A smarter machine needs more knowledge, but every extra weight slows down each word.",
    "Like a hospital's triage desk, a router sends each word to just 2 of 8 expert bays.",
    "Watch the words split up, and see that each one pays only for the bays it visits.",
  ],
  stats: [
    {
      id: "total",
      label: "weights in the machine",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "params.total" },
    },
    {
      id: "per-word",
      label: "weights one word uses",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "params.perToken" },
    },
    {
      id: "llama",
      label: "per word, as 8 experts (hypothetical)",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "moeActiveParams", args: { experts: 8, topK: 2 } },
    },
  ],
  scenarios: [
    {
      id: "little",
      label: "A little girl",
      prompt: "Once upon a time, there was a little girl",
      probe: "expert-usage-entropy",
    },
  ],
  labels: [
    { anchor: "desk", analogy: "Triage desk: picks 2 bays", technical: "Router (top-2 of 8)" },
    { anchor: "bays", analogy: "Expert bays", technical: "8 expert MLPs" },
    { anchor: "tokens", analogy: "Words waiting to be seen", technical: "Tokens" },
    { anchor: "usage", analogy: "How busy each bay is", technical: "Share of routing slots" },
  ],
  loop: {
    durationSec: 24,
    endSec: 23.2,
    inputs: ["Once upon a time, there was a little girl"],
    channels: {
      /** Which word is at the desk (0-based), one every 2.1 s. */
      token: Array.from({ length: ROUTED_TOKENS }, (_, n) => ({
        t: n === 0 ? 0 : 0.4 + 2.1 * n,
        v: n,
        ease: "step" as const,
      })),
      /** The word's two copies walking from the desk into their bays: 0 at the desk, 1 in. */
      route: [
        { t: 0, v: 0 },
        ...Array.from({ length: ROUTED_TOKENS }, (_, n) => [
          { t: 0.4 + 2.1 * n + 0.01, v: 0, ease: "step" as const },
          { t: 0.4 + 2.1 * n + 0.3, v: 0 },
          { t: 0.4 + 2.1 * n + 0.9, v: 1, ease: "inOut" as const },
        ]).flat(),
        { t: 14, v: 1 },
        { t: 14.6, v: 0, ease: "inOut" },
      ],
      /** The usage histogram rising. */
      usage: [
        { t: 0, v: 0 },
        { t: 14.4, v: 0 },
        { t: 16, v: 1, ease: "inOut" },
        { t: 23.2, v: 1 },
        { t: 23.8, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      { t: 0, id: "queue", note: "the words queue at the triage desk", focus: "tokens" },
      {
        t: 1.2,
        id: "route",
        note: "each word goes to 2 of 8 bays (the router's real choice); 6 stay dark",
        focus: "bays",
        tint: "focus",
      },
      {
        t: 6.7,
        id: "small-work",
        note: "each word pays for 2 bays while the machine holds 8",
        focus: "desk",
      },
      {
        t: 14.4,
        id: "usage",
        note: "over held-out text every bay gets its share: the router did not collapse",
        focus: "usage",
      },
      {
        t: 19,
        id: "last-part",
        note: "the last part: next, the whole machine together",
        focus: "bays",
      },
    ],
  },
  shot: "triage-hall",
  help: {
    sources: [
      { label: "Switch Transformer (Fedus et al. 2021)", url: "https://arxiv.org/abs/2101.03961" },
      { label: "Mixtral of Experts (Jiang et al. 2024)", url: "https://arxiv.org/abs/2401.04088" },
    ],
  },
  ogTimeSec: 6.5,
};
