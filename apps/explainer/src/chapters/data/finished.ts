/**
 * Chapter 15: the finished machine. Every earlier chapter's scene stands in the room at once,
 * each built by its own builder and run on its own tiny model (no new inference path), and
 * the camera tours them in the order a word meets them. At each stop the part pulses and its
 * own chapter's label shows, in the current reading; the tour ends on the whole machine, with
 * the chips setting this tiny model against Llama-3-8B.
 *
 * The loop is generated from the station list: a wide opening, then a move and a hold per
 * station, then back to the wide shot. Stop 0 and stop `STATIONS.length + 1` are the wide
 * shot; stop `n` (1-based) is station `n`.
 */
import type { AnchorId, ChapterDef, Keyframe, ShotId } from "../types.ts";
import { attention } from "./attention.ts";
import { autocomplete } from "./autocomplete.ts";
import { batching } from "./batching.ts";
import { embeddings } from "./embeddings.ts";
import { experts } from "./experts.ts";
import { generation } from "./generation.ts";
import { kvCache } from "./kv-cache.ts";
import { mlp } from "./mlp.ts";
import { positions } from "./positions.ts";
import { quantization } from "./quantization.ts";
import { residual } from "./residual.ts";
import { sampling } from "./sampling.ts";
import { speculative } from "./speculative.ts";
import { stack } from "./stack.ts";
import { tokenizer } from "./tokenizer.ts";

/** A station of the machine: an earlier chapter, and which of its own labels names it here. */
export interface Station {
  def: ChapterDef;
  /** One of `def.labels`' anchors: the part the tour stops on, and the label it shows. */
  label: AnchorId;
  /** The chapter's scene is drawn this much smaller, to fit its place on the floor. */
  scale: number;
  /** The shot the tour frames it with, scaled down with it (default: the chapter's own). */
  shot?: ShotId;
}

/**
 * The tour, in the order a word meets the parts: where it began (the tally board), then in
 * through the bricks and pins, the block's parts, the stack, out through the die and round the
 * generation loop, then the serving tricks.
 */
export const STATIONS: readonly Station[] = [
  { def: autocomplete, label: "board", scale: 0.42 },
  { def: tokenizer, label: "bricks", scale: 0.42 },
  { def: embeddings, label: "pins", scale: 0.42 },
  { def: attention, label: "pipes", scale: 0.38 },
  { def: positions, label: "dials", scale: 0.38 },
  { def: mlp, label: "panel", scale: 0.28 },
  { def: experts, label: "bays", scale: 0.26 },
  { def: residual, label: "river", scale: 0.26 },
  // Its own hero shot is block 1 close up; here the tour frames the whole line.
  { def: stack, label: "line", scale: 0.15, shot: "stack-wide" },
  { def: sampling, label: "die", scale: 0.42 },
  { def: generation, label: "rail", scale: 0.26 },
  { def: kvCache, label: "rack", scale: 0.26 },
  { def: speculative, label: "junior", scale: 0.31 },
  { def: quantization, label: "crates", scale: 0.34 },
  { def: batching, label: "bus", scale: 0.38 },
];

/**
 * Where the stations stand: a grid on the floor, `columns` wide, walked in a serpentine (the
 * back row left to right, the next right to left …) so each stop is next to the one before.
 * `cell` is the spacing (x, z) in metres and `center` the grid's middle. At a stop the camera
 * looks down at least `minPitch` (radians) where a row stands in front, so it sees over it;
 * the front row keeps its own shot's pitch.
 */
export const FLOOR = {
  columns: 5,
  cell: [1.7, 1.75],
  center: [-0.3, 1.2],
  minPitch: 0.6,
} as const;

/** The tour's pacing, seconds: the wide opening, each move and hold, the return, the end. */
const TOUR = { open: 2, move: 0.45, hold: 1.15, back: 1.2, end: 2.4 } as const;

const STOPS = STATIONS.length;
const STEP = TOUR.move + TOUR.hold;
/** When the camera settles on station `n` (0-based). */
export const arrivesAt = (n: number) => TOUR.open + n * STEP + TOUR.move;
const RETURN_AT = TOUR.open + STOPS * STEP;
/** When the camera is back on the whole machine. */
export const wholeAgainAt = RETURN_AT + TOUR.back;
const DURATION = wholeAgainAt + TOUR.end;

const stopKeys: Keyframe[] = [
  // The wrap from the last stop (the wide shot) to the first (the same shot) is a cut.
  { t: 0, v: 0, ease: "step" },
  { t: TOUR.open, v: 0 },
  ...STATIONS.flatMap((_, n) => [
    { t: arrivesAt(n), v: n + 1 },
    { t: arrivesAt(n) + TOUR.hold, v: n + 1 },
  ]),
  { t: wholeAgainAt, v: STOPS + 1 },
];

export const finished: ChapterDef = {
  slug: "finished",
  title: "The finished machine",
  why: "Each chapter showed one part on its own, but a real model runs all of them for every word.",
  model: "full",
  scene: "finished",
  caption: {
    default: {
      story: [
        "Every part you added is here, working as one machine, and the camera visits them in the order a word meets them.",
        "Llama-3-8B is built from these same kinds of parts, less the tally board and the expert bays, only far bigger.",
      ],
      precisely:
        "Each station is its own chapter's scene, run on that chapter's tiny model. Llama-3-8B: a tokenizer, embeddings, 32 blocks of RoPE attention (GQA) and SwiGLU MLP on a residual stream with RMSNorm, then sampling, one token per pass, with a KV cache; it is not a mixture of experts.",
    },
    byFollow: {
      reading: {
        story: [
          "First the text becomes bricks, and each brick becomes a pin on the map of meanings.",
          "From here on the machine never sees letters again, only the arrows those pins stand for.",
        ],
        precisely:
          "Tokenization splits text into vocabulary pieces; each token id selects one row of the embedding table, a vector of numbers the blocks then read and add to.",
      },
      blocks: {
        story: [
          "Inside each block, readers draw on earlier words, then the question panel adds what it knows, all onto the river.",
          "The blocks repeat down the line, and the die at the end picks the next word.",
        ],
        precisely:
          "A transformer block is attention then an MLP, each added to the residual stream after RMSNorm; the last layer's vector is scored against the vocabulary and sampled.",
      },
      serving: {
        story: [
          "The last stations are about running the machine for many readers at once, cheaply.",
          "Kept notes, a junior drafter, lighter weights and a full bus all get more words out of each trip.",
        ],
        precisely:
          "KV caching, speculative decoding, 8-bit quantization and batching change how fast and how cheaply tokens come out; batching and caching leave the output unchanged, quantization changes it slightly.",
      },
    },
  },
  stats: [
    {
      id: "tiny",
      label: "weights, all parts",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "params.total" },
    },
    {
      id: "llama",
      label: "weights, all parts",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "params", args: {} },
    },
    {
      id: "blocks",
      label: "blocks",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "layers", args: {} },
    },
  ],
  follow: [
    { id: "reading", label: "Reading in", anchor: "tokenizer" },
    { id: "blocks", label: "The blocks", anchor: "stack" },
    { id: "serving", label: "Serving", anchor: "batching" },
  ],
  slider: {
    id: "stop",
    label: "Part to visit",
    min: 1,
    max: STOPS,
    step: 1,
    initial: 1,
    loop: "stop",
  },
  scenarios: [],
  views: ["whole"],
  // Each station's own label, in both readings: one owner for the words.
  labels: STATIONS.map(({ def, label }) => {
    const own = def.labels.find((l) => l.anchor === label);
    if (!own) throw new Error(`finished: ${def.slug} has no label on ${label}`);
    return { anchor: def.slug as AnchorId, analogy: own.analogy, precise: own.precise };
  }),
  tour: { channel: "stop" },
  loop: {
    durationSec: DURATION,
    channels: { stop: stopKeys },
    beats: [
      { t: 0, id: "whole", note: "the whole machine: every part you added, in one room" },
      ...STATIONS.map(({ def }, n) => ({
        t: arrivesAt(n),
        id: `stop-${def.slug}`,
        note: `stop ${n + 1}: ${def.title.toLowerCase()} pulses, with its own label`,
        focus: def.slug as AnchorId,
      })),
      {
        t: wholeAgainAt,
        id: "compare",
        note: "back to the whole machine: the chips set this tiny model against Llama-3-8B",
      },
    ],
  },
  shot: "finished-wide",
  help: {
    sources: [],
    notes: [
      "Each station is drawn by its own chapter's scene and fed by its own chapter's tiny model; the machine is scaled down to fit the room.",
    ],
  },
  ogTimeSec: 1.5,
};
