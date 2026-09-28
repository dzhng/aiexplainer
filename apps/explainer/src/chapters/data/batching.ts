/**
 * Chapter 11: batching, the bus. There is no tiny model here (D27): decode speed is a GPU
 * memory effect, so every number is roofline arithmetic for Llama-3-8B on H100 SXM. One trip
 * (a decode step) hauls every weight once; riders (sequences) share it almost for free until
 * the bus is full (`computeBoundBatch`), then throughput flattens. The loop plays the slider
 * (`slider.loop`), filling the bus, until the reader moves it; the chips follow the slider.
 */
import type { ChapterDef } from "../types.ts";

/**
 * The arithmetic's inputs, shared by the chips and the scene's tags: bf16 weights and KV
 * cache, and short conversations (16 tokens so far), so the KV reads stay small and the knee
 * sits near the GPU's ridge.
 */
export const BUS_ARITH = { contextLen: 16, weightBytes: 2, kvBytes: 2 } as const;
/** The prompt that boards at once in the prefill beat: short enough to still cost one trip. */
export const PREFILL_TOKENS = 256;

export const batching: ChapterDef = {
  slug: "batching",
  title: "Batching",
  why: "Even with its notes kept, the machine waits on every weight for each word while the GPU's arithmetic sits idle.",
  model: null,
  scene: "batching",
  caption: {
    default: {
      story: [
        "A bus trip costs about the same whether it carries one rider or a hundred, because the trip itself is the expensive part.",
        "Every new word means hauling all the weights to the GPU's arithmetic, so many conversations share each haul.",
      ],
      technical:
        "Batching decodes one next token for each of many sequences in a single step, reading the weights once for all of them; prefill reads a whole prompt in one step the same way.",
    },
    byFollow: {
      riders: {
        story: [
          "Each glowing rider is one conversation waiting for its next word.",
          "They ride together, so every seat filled adds a word per trip for almost nothing extra.",
        ],
        technical:
          "Each glowing cube is one token being worked on: in decode, one sequence of the batch; in prefill, one token of the prompt. A decode step reads the weights once plus each sequence's own KV cache.",
      },
      crates: {
        story: [
          "The crates are the model's weights, and every single trip hauls all of them.",
          "That haul, not the arithmetic, is what makes a lone rider slow.",
        ],
        technical:
          "At small batches a decode step lasts as long as reading every weight from GPU memory; the sums finish long before the bytes arrive (memory-bound).",
      },
      stop: {
        story: [
          "Once the seats are full, extra riders stop riding for free, and each trip takes longer.",
          "From here the arithmetic, not the haul, sets the pace, so the total stops rising.",
        ],
        technical:
          "Past the knee a step's FLOPs take longer than its bytes (compute-bound), so tokens per second across the batch stays at the GPU's compute ceiling.",
      },
    },
  },
  stats: [
    {
      id: "rider-speed",
      label: "one rider's top speed",
      format: "tok/s",
      scale: "Llama-3-8B on H100 SXM",
      value: {
        kind: "arith",
        fn: "decodeCeilingTokPerSec",
        args: { batch: { slider: true }, ...BUS_ARITH },
      },
    },
    {
      id: "bus-speed",
      label: "all riders together",
      format: "tok/s",
      scale: "Llama-3-8B on H100 SXM",
      value: {
        kind: "arith",
        fn: "batchThroughput",
        args: { batch: { slider: true }, ...BUS_ARITH },
      },
    },
    {
      id: "bus-full",
      label: "riders a full bus holds",
      format: "int",
      scale: "Llama-3-8B on H100 SXM",
      value: { kind: "arith", fn: "computeBoundBatch", args: { ...BUS_ARITH } },
    },
  ],
  follow: [
    { id: "riders", label: "Riders", anchor: "riders" },
    { id: "crates", label: "Cargo", anchor: "crates" },
    { id: "stop", label: "Full bus", anchor: "stop" },
  ],
  slider: {
    id: "batch",
    label: "Riders (batch size)",
    min: 1,
    max: 512,
    step: 1,
    initial: 1,
    loop: "batch",
  },
  scenarios: [],
  // No Cutaway: both sides are windows already, so a section would only paint the shell.
  views: ["whole", "exploded"],
  labels: [
    { anchor: "bus", analogy: "The bus: one trip per word", technical: "One decode step" },
    {
      anchor: "riders",
      analogy: "Riders: one word each per trip",
      technical: "Tokens in this step",
    },
    { anchor: "crates", analogy: "Cargo: all the weights", technical: "Weights read every step" },
    {
      anchor: "stop",
      analogy: "The stop: riders past a full bus",
      technical: "Past the knee: compute-bound",
    },
  ],
  loop: {
    durationSec: 24,
    channels: {
      /** The crates: 0 lifted clear above the roof, 1 resting on the rack. */
      crates: [
        { t: 0, v: 0 },
        { t: 0.2, v: 0 },
        { t: 1.6, v: 1, ease: "inOut" },
        { t: 23.2, v: 1 },
        { t: 23.9, v: 0, ease: "inOut" },
      ],
      /**
       * Riders on the bus (the batch the scene shows); 0 before anyone boards. It plays the
       * slider, so the chips follow it.
       */
      batch: [
        { t: 0, v: 0 },
        { t: 2, v: 1, ease: "step" },
        { t: 3.6, v: 1 },
        { t: 7.8, v: 329, ease: "inOut" },
        { t: 8.6, v: 329 },
        { t: 10.6, v: 512, ease: "inOut" },
        { t: 12.4, v: 512 },
        { t: 12.9, v: 0, ease: "inOut" },
        // The failure beat: one rider again, still paying for the whole haul.
        { t: 17.6, v: 1, ease: "step" },
        { t: 23, v: 1 },
        { t: 23.4, v: 0, ease: "step" },
      ],
      /** Prefill: 1 while one prompt's tokens fill the seats in a single trip. */
      prefill: [
        { t: 0, v: 0 },
        { t: 13.4, v: 1, ease: "step" },
        { t: 17, v: 1 },
        { t: 17.4, v: 0, ease: "inOut" },
      ],
      /** The failure beat: the crates glow with their weight. */
      heavy: [
        { t: 0, v: 0 },
        { t: 17.6, v: 0 },
        { t: 18.2, v: 1, ease: "inOut" },
        { t: 22.4, v: 1 },
        { t: 23, v: 0, ease: "inOut" },
      ],
    },
    beats: [
      {
        t: 0,
        id: "load",
        note: "the weight crates load onto the roof: every trip hauls them",
        focus: "crates",
      },
      {
        t: 2,
        id: "one-rider",
        note: "one rider boards: 4.8 ms per trip, 209 tok/s",
        focus: "riders",
      },
      {
        t: 3.6,
        id: "fill",
        note: "the seats fill; the trip barely slows and the total climbs",
        focus: "riders",
      },
      {
        t: 7.8,
        id: "full",
        note: "the bus is full: the sums now take as long as the haul",
        focus: "bus",
      },
      {
        t: 8.6,
        id: "overflow",
        note: "extra riders wait: trips get longer, the total stays flat",
        focus: "stop",
      },
      {
        t: 13.4,
        id: "prefill",
        note: "prefill: one prompt's 256 tokens board in a single trip",
        focus: "riders",
        tint: "active",
      },
      {
        t: 17.6,
        id: "heavy",
        note: "one rider again, and the crates glow: every trip still hauls all the weights",
        focus: "crates",
        tint: "focus",
      },
    ],
  },
  shot: "bus-side",
  help: {
    sources: [
      {
        label: "Transformer inference arithmetic (kipp.ly)",
        url: "https://kipp.ly/transformer-inference-arithmetic/",
      },
    ],
  },
  ogTimeSec: 7,
};
