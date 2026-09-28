/**
 * Chapter 12: quantization, a lower-resolution photo. The `full` model's weights rounded to
 * 8 bits (`full-q8`, q8_0) take about half the bytes and still pick nearly the same words. The
 * strip shows one real group of 32 weights at 16 and 8 bits; a magnifier zooms on the weight
 * the rounding moves most, because at full size the difference is too small to see. Both
 * machines continue the same prompt greedily. The failure: it is still one word per trip.
 */
import type { ChapterDef } from "../types.ts";

/** The weights on the strip: one q8_0 group (32 values) of the first layer's query weights. */
export const STRIP = { tensor: "layers.0.attn.wq", start: 0, count: 32 } as const;
/** Words each machine adds to the prompt. */
export const CONTINUE_WORDS = 6;

export const quantization: ChapterDef = {
  slug: "quantization",
  title: "Quantization",
  why: "Every trip still hauls every weight, and at 16 bits a number the cargo is heavy.",
  model: "full-q8",
  scene: "quantization",
  caption: {
    story: [
      "A lower-resolution photo keeps the picture in half the space, and the same trick works on the machine's numbers.",
      "Each weight is rounded to one of 255 levels, so the copy is half the size and still picks nearly the same words.",
    ],
    technical:
      "8-bit quantization (q8_0) stores each group of 32 weights as one 16-bit scale and 32 whole numbers from −127 to 127; each weight becomes scale × its number.",
  },
  brief: [
    "Every trip still hauls every weight, and at 16 bits a number the cargo is heavy.",
    "Like a lower-resolution photo, rounding each number keeps the picture in half the space.",
    "Watch the weights snap to 8 bits, the crate shrink, and both machines still pick nearly the same words.",
  ],
  stats: [
    {
      id: "llama-weights",
      label: "Llama-3-8B weights at this precision",
      format: "bytes",
      scale: "Llama-3-8B",
      value: { kind: "arith", fn: "weightBytes", args: { weightBytes: { slider: true } } },
    },
    {
      id: "agreement",
      label: "same top word as 16-bit",
      format: "pct",
      scale: "this tiny model",
      value: { kind: "probe", probe: "q8-agreement" },
    },
    {
      id: "kl",
      label: "how far its guesses drift",
      format: "num",
      scale: "this tiny model",
      value: { kind: "probe", probe: "q8-kl" },
    },
  ],
  slider: {
    id: "bytes",
    label: "Bytes per weight",
    hint: "2 is 16-bit, 1 is 8-bit: half the bytes per word.",
    min: 1,
    max: 2,
    step: 1,
    initial: 2,
    loop: "bytes",
  },
  scenarios: [
    { id: "once", label: "Once upon a", prompt: "Once upon a", probe: "q8-kl" },
    {
      id: "bird",
      label: "A big bird who",
      prompt: "Once upon a time, there was a big bird who",
      probe: "q8-kl",
    },
  ],
  labels: [
    {
      anchor: "strip",
      analogy: "A strip of real weights",
      technical: "32 weights, one q8_0 group",
    },
    { anchor: "lens", analogy: "Magnifier: one weight", technical: "One weight on the 8-bit grid" },
    { anchor: "crates", analogy: "The cargo, 16-bit vs 8-bit", technical: "Weights file bytes" },
    { anchor: "machines", analogy: "Two machines, one story", technical: "16-bit vs 8-bit copy" },
  ],
  loop: {
    durationSec: 24,
    endSec: 22.8,
    inputs: ["Once upon a time, there was a big bird who"],
    channels: {
      /** Resolution: 0 the 16-bit weights, 1 the 8-bit ones (the strip and the magnifier). */
      res: [
        { t: 0, v: 0 },
        { t: 3.5, v: 0 },
        { t: 5, v: 1, ease: "inOut" },
        { t: 23, v: 1 },
        { t: 23.8, v: 0, ease: "inOut" },
      ],
      /** Bytes per weight: plays the slider, so the Llama chip halves with the crate. */
      bytes: [
        { t: 0, v: 2, ease: "step" },
        { t: 7, v: 1, ease: "step" },
      ],
      /** The 8-bit crate: 0 absent, 1 at its measured size beside the 16-bit one. */
      crate: [
        { t: 0, v: 0 },
        { t: 6, v: 0 },
        { t: 7.5, v: 1, ease: "inOut" },
        { t: 23.2, v: 1 },
        { t: 23.8, v: 0, ease: "inOut" },
      ],
      /** Words each machine has added so far (one per trip). */
      words: [
        { t: 0, v: 0, ease: "step" },
        { t: 10, v: 1, ease: "step" },
        { t: 11.3, v: 2, ease: "step" },
        { t: 12.6, v: 3, ease: "step" },
        { t: 13.9, v: 4, ease: "step" },
        { t: 15.2, v: 5, ease: "step" },
        { t: 16.5, v: 6, ease: "step" },
        { t: 23.6, v: 0, ease: "step" },
      ],
      /** The failure beat: the machines pulse once per word. */
      trip: [
        { t: 0, v: 0 },
        { t: 18.5, v: 0 },
        { t: 19.2, v: 1, ease: "inOut" },
        { t: 22.8, v: 1 },
        { t: 23.4, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      { t: 0, id: "strip", note: "a strip of 32 real weights, stored at 16 bits", focus: "strip" },
      {
        t: 3.5,
        id: "round",
        note: "rounded to 8 bits: the bars barely move; the magnifier shows the snap",
        focus: "lens",
      },
      {
        t: 6,
        id: "crate",
        note: "the 8-bit crate is about half the 16-bit one; Llama-3-8B halves too",
        focus: "crates",
      },
      {
        t: 10,
        id: "continue",
        note: "both machines continue the same story, word by word",
        focus: "machines",
      },
      {
        t: 18.5,
        id: "one-per-trip",
        note: "lighter cargo, but still one word per trip",
        focus: "machines",
        tint: "focus",
      },
    ],
  },
  shot: "quant-bench",
  help: {
    sources: [
      {
        label: "llama.cpp q8_0 block format",
        url: "https://github.com/ggml-org/llama.cpp/blob/master/ggml/src/ggml-common.h",
      },
    ],
  },
  ogTimeSec: 8,
};
