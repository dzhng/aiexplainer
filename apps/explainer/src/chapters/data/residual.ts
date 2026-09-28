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
    default: {
      story: [
        "Chain stations so each one replaces the signal with its own output, and the word's arrow fades out by the second station.",
        "Run a river past the stations instead: each one pours in what it worked out, and a volume knob keeps its input steady.",
      ],
      precisely:
        "The river is the residual stream: each block adds its output to x instead of replacing it (x ← x + block(x)). The knob is RMSNorm: each block reads x divided by its root-mean-square size.",
    },
    byFollow: {
      river: {
        story: [
          "The river only ever grows: every station adds to it, and nothing a station does can wash away what came before.",
          "That is how the first word's meaning survives all the way to the last station.",
        ],
        precisely:
          "River height is the stream's RMS at the last word, as a share of the embedding's, square-root scaled; with it, this tiny model's stream ends many times its starting size.",
      },
      knob: {
        story: [
          "A growing river would drown each station in louder and louder input, so each station turns its own volume knob down first.",
          "The knob turns further at every station because the river it reads from is bigger each time.",
        ],
        precisely:
          "RMSNorm: before each block, x is divided by sqrt(mean(x²)) and scaled by learned gains. The knob's angle is that divisor, log scaled.",
      },
      readout: {
        story: [
          "Without the river the machine has no idea what comes next, so every word is exactly as likely as any other.",
          "With the river it makes a real guess, though one pass through four stations still leaves it unsure.",
        ],
        precisely:
          "The readout is each model's top next token and its probability on this text; the chips are the two models' average loss on held-out TinyStories text.",
      },
    },
  },
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
  follow: [
    { id: "river", label: "The river", anchor: "river" },
    { id: "knob", label: "Volume knob", anchor: "knob" },
    { id: "readout", label: "Best guess", anchor: "readout" },
  ],
  slider: { id: "station", label: "Station to read", min: 1, max: 4, step: 1, initial: 3 },
  scenarios: [
    {
      id: "little",
      label: "Once upon a time, there was a little",
      prompt: "Once upon a time, there was a little",
      probe: "residual-loss",
    },
  ],
  views: ["whole", "exploded"],
  labels: [
    { anchor: "stations", analogy: "Stations", precise: "Transformer blocks" },
    { anchor: "river", analogy: "The river", precise: "Residual stream" },
    { anchor: "knob", analogy: "Volume knob", precise: "RMSNorm" },
    { anchor: "readout", analogy: "Best guess", precise: "Top next token" },
  ],
  loop: {
    durationSec: 20,
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
