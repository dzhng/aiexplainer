/**
 * Chapter 2: embeddings, as pins on a map (D37: the `embed` model's input table). Every pin is
 * a real row of the table seen from its 3 most spread-out directions (a PCA computed offline,
 * `scene/embed-map.json`); the pinned words are the model's neighbour-probe pairs. The loop's
 * “cat” and “kitten” fly in from chapter 1 as bricks and land side by side; the failure the next
 * chapter fixes is that a pin only knows its own word (“it” lands on the same pin every time).
 */
import type { ChapterDef } from "../types.ts";

export const embeddings: ChapterDef = {
  slug: "embeddings",
  title: "Embeddings",
  why: "Chapter 1's “cat” and “kitten” were two unrelated numbers. So give every piece a place on a map.",
  model: "embed",
  scene: "embeddings",
  caption: {
    story: [
      "Each brick becomes a pin on a map, and the machine learns where to stick it, so words used alike end up close.",
      "“cat” lands right beside “kitten”, and “sun” beside “moon”: nobody told it that, it learned it from the stories.",
    ],
    technical:
      "Each token id picks one row of an embedding table, a list of numbers called its embedding (a vector). This map shows the pinned words' rows along the 3 directions where they differ most (PCA, computed once offline); the real rows have many more.",
  },
  stats: [
    {
      id: "directions",
      label: "directions per word",
      format: "int",
      scale: "this tiny model",
      value: { kind: "model", metric: "dModel" },
    },
    {
      id: "llama-directions",
      label: "directions per word",
      format: "int",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "hidden", args: {} },
    },
    {
      id: "partner-nearer",
      label: "partner beats random words",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "neighbours" },
    },
  ],
  scenarios: [
    { id: "sun", label: "sun moon", prompt: "sun moon", probe: "neighbours" },
    { id: "said", label: "said asked", prompt: "said asked", probe: "neighbours" },
    { id: "sad", label: "sad upset", prompt: "sad upset", probe: "neighbours" },
  ],
  labels: [
    {
      anchor: "map",
      analogy: "The map (a shadow)",
      technical: "PCA projection",
    },
    { anchor: "pins", analogy: "A word's pin", technical: "Token embedding" },
    { anchor: "arrows", analogy: "Its arrow from the centre", technical: "Embedding vector" },
    { anchor: "origin", analogy: "The centre: all zeros", technical: "Zero vector" },
    { anchor: "text", analogy: "This word's pin", technical: "Looked-up embedding" },
  ],
  loop: {
    durationSec: 24,
    inputs: ["cat kitten", "it"],
    channels: {
      /** Which loop input is flying in; it changes only while none of its pins is down. */
      input: [
        { t: 0, v: 0, ease: "step" },
        { t: 14.4, v: 1, ease: "step" },
      ],
      /** The input's bricks appear over the map, fly to their places and become pins. */
      fly: [
        { t: 0, v: 0 },
        { t: 0.2, v: 0 },
        { t: 3.4, v: 1 },
        { t: 14.4, v: 1 },
        { t: 14.45, v: 0, ease: "step" },
        { t: 14.6, v: 0 },
        { t: 16.4, v: 1 },
        { t: 23.8, v: 1 },
        { t: 23.85, v: 0, ease: "step" },
      ],
      /** The input's pins sink back into the map before the next word (and at the end). */
      sink: [
        { t: 0, v: 0 },
        { t: 13.4, v: 0 },
        { t: 14.2, v: 1, ease: "inOut" },
        { t: 14.4, v: 1 },
        { t: 14.45, v: 0, ease: "step" },
        { t: 22.8, v: 0 },
        { t: 23.6, v: 1, ease: "inOut" },
        { t: 23.8, v: 1 },
        { t: 23.85, v: 0, ease: "step" },
      ],
      /** Every arrow but the input word's shrinks away: the failure beat isolates “it”. */
      focus: [
        { t: 0, v: 0 },
        { t: 17.4, v: 0 },
        { t: 18.2, v: 1, ease: "inOut" },
        { t: 22.6, v: 1 },
        { t: 23.2, v: 0, ease: "inOut" },
      ],
      /** The input's pins light up. */
      pair: [
        { t: 0, v: 0 },
        { t: 4.6, v: 0 },
        { t: 5.2, v: 1, ease: "inOut" },
        { t: 9.2, v: 1 },
        { t: 9.8, v: 0, ease: "inOut" },
        { t: 17.4, v: 0 },
        { t: 18, v: 1, ease: "inOut" },
        { t: 22.4, v: 1 },
        { t: 22.9, v: 0, ease: "inOut" },
      ],
      /** Arrows grow from the origin to every pin. */
      arrows: [
        { t: 0, v: 0 },
        { t: 9.6, v: 0 },
        { t: 12, v: 1, ease: "inOut" },
        { t: 22.8, v: 1 },
        { t: 23.7, v: 0, ease: "inOut" },
      ],
      pairNote: [
        { t: 0, v: 0, ease: "step" },
        { t: 5, v: 1, ease: "step" },
        { t: 9.6, v: 0, ease: "step" },
      ],
      itNote: [
        { t: 0, v: 0, ease: "step" },
        { t: 17.6, v: 1, ease: "step" },
        { t: 22.6, v: 0, ease: "step" },
      ],
    },
    beats: [
      {
        t: 0,
        id: "bricks",
        note: "chapter 1's “cat” and “kitten” bricks appear over the map",
        focus: "text",
      },
      {
        t: 1.8,
        id: "fly",
        note: "each brick flies to its own word's place and becomes a pin",
        focus: "pins",
      },
      {
        t: 5,
        id: "close",
        note: "cat and kitten light up side by side, with how nearly they point the same way",
        focus: "pins",
        tint: "focus",
      },
      {
        t: 9.6,
        id: "arrows",
        note: "an arrow grows from the centre to every pin",
        focus: "arrows",
      },
      { t: 14.4, id: "it-lands", note: "the word “it” flies in and becomes a pin", focus: "text" },
      {
        t: 17.6,
        id: "failure",
        note: "the other arrows fade: “it” always lands on this one pin, whatever came before",
        focus: "text",
        tint: "focus",
      },
      {
        t: 22.6,
        id: "reset",
        note: "the pin sinks back into the map and the arrows shrink; the loop starts again",
        focus: "origin",
      },
    ],
  },
  shot: "map-table",
  help: {
    sources: [],
    notes: [
      "The map is a shadow: each pin's place is its word's row of this tiny model's embedding table, projected onto the 3 directions along which the 60 pinned words differ most (principal component analysis, computed once, offline, from the model file). Across and into the map are the first two directions; a pin's height is the third.",
    ],
  },
  ogTimeSec: 12.5,
};
