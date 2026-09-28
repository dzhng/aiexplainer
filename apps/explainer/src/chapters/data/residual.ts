/**
 * Chapter 7: the residual stream (a river) and RMSNorm (a volume knob). The loop runs the
 * `residual` probe's prompt through both 4-layer models: `noresidual`, which never learned
 * (its signal dies after the first station), then `residual`, whose river keeps it. The chips
 * are the two models' measured val losses and the residual model's signal-kept probe.
 */
import type { ChapterDef } from "../types.ts";

export const residual: ChapterDef = {
  slug: "residual",
  title: "A river and a volume knob",
  why: "Stack a few panels one after another and the start of the arrow is lost after the first.",
  model: "residual",
  scene: "residual",
  caption: {
    story: [
      "Chain stations so each one replaces the signal with its own output, and the word's arrow fades out by the second station.",
      "Run a river past the stations instead: each one pours in what it worked out, and a volume knob keeps its input steady.",
    ],
    technical:
      "The river is the residual stream: each block adds its output to x instead of replacing it (x ← x + block(x)). The knob is RMSNorm: each block reads x divided by its root-mean-square size.",
  },
  brief: [
    "Chain a few panels one after another and the word's arrow fades out after the first.",
    "This lesson runs a river past them instead, and each one pours in what it worked out.",
    "Watch the signal die without the river, then carry through with it.",
  ],
  stats: [
    {
      id: "loss-without",
      label: "guessing error, no river",
      format: "nats",
      scale: "this tiny model",
      value: { kind: "probe", probe: "val-loss-noresidual" },
    },
    {
      id: "loss-with",
      label: "guessing error, with river",
      format: "nats",
      scale: "this tiny model",
      value: { kind: "probe", probe: "val-loss-residual" },
    },
    {
      id: "signal",
      label: "signal size after 4 stations",
      format: "x",
      scale: "this tiny model",
      value: { kind: "probe", probe: "signal-preserved-residual" },
    },
  ],
  scenarios: [
    {
      id: "little",
      label: "Once upon a time, there was a little",
      prompt: "Once upon a time, there was a little",
      probe: "residual-loss",
    },
  ],
  labels: [
    { anchor: "stations", analogy: "Stations", technical: "Transformer blocks" },
    { anchor: "river", analogy: "The river", technical: "Residual stream" },
    { anchor: "knob", analogy: "Volume knob", technical: "RMSNorm" },
    { anchor: "readout", analogy: "Best guess", technical: "Top next token" },
  ],
  loop: {
    durationSec: 20,
    endSec: 18.4,
    inputs: ["Once upon a time, there was a little"],
    channels: {
      /** No river: the signal travels pipe by pipe and dies after the first station. */
      flowA: [
        { t: 0, v: 0 },
        { t: 0.3, v: 0 },
        { t: 2.8, v: 1 },
        { t: 18.6, v: 1 },
        { t: 18.7, v: 0, ease: "step" },
      ],
      /** The river and the knobs come in; the pipes go. */
      river: [
        { t: 0, v: 0 },
        { t: 4.4, v: 0 },
        { t: 5.2, v: 1, ease: "inOut" },
        { t: 18.4, v: 1 },
        { t: 19.6, v: 0, ease: "inOut" },
      ],
      /** The river fills station by station; each pours in and turns its knob. */
      flowB: [
        { t: 0, v: 0 },
        { t: 5.2, v: 0 },
        { t: 8.6, v: 1 },
        { t: 18.4, v: 1 },
        { t: 19.6, v: 0, ease: "inOut" },
      ],
      /** The failure beat: one pass through four stations is still a shaky guess. */
      failure: [
        { t: 0, v: 0 },
        { t: 12.4, v: 0, ease: "step" },
        { t: 12.5, v: 1, ease: "step" },
        { t: 18.4, v: 1 },
        { t: 18.5, v: 0, ease: "step" },
      ],
    },
    beats: [
      {
        t: 0.3,
        id: "no-river",
        note: "no river: the signal passes from station to station and dies after the first",
        focus: "stations",
      },
      {
        t: 2.8,
        id: "no-idea",
        note: "with nothing left, every next word is equally likely",
        focus: "readout",
      },
      { t: 4.4, id: "river", note: "a river runs in under the stations", focus: "river" },
      {
        t: 5.2,
        id: "pour",
        note: "each station pours into the river and turns its knob down",
        focus: "knob",
        tint: "flow",
      },
      { t: 8.6, id: "guess", note: "with the river, a real best guess", focus: "readout" },
      {
        t: 12.4,
        id: "shaky",
        note: "one pass through four stations is still a shaky guess",
        focus: "readout",
      },
      { t: 18.4, id: "reset", note: "the river drains; the loop starts again", focus: "river" },
    ],
  },
  shot: "residual-river",
  help: {
    sources: [
      { label: "RMSNorm (Zhang & Sennrich 2019)", url: "https://arxiv.org/abs/1910.07467" },
    ],
  },
  ogTimeSec: 11,
};
