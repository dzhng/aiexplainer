/**
 * A chapter is pure data. The HUD, the loop, the stats and the scene are all
 * driven by a `ChapterDef`; `validateChapter()` enforces the copy rules and references.
 */
import type { ArithFnName, ModelId, ModelMetric } from "@repo/llm";
import type shots from "../look/shots.json";
import type { PaletteToken } from "../look/look.ts";
import type { ChapterSlug } from "./ladder.ts";
import type { AnchorId, SceneBuilderId } from "./scenes.ts";

export type { AnchorId, ChapterSlug, ModelId, SceneBuilderId };

/** A chapter's model: a trained model's id, or the shared tokenizer alone (chapter 1). */
export type ChapterModelId = ModelId | "tokenizer";

export type ShotId = keyof typeof shots;
export type ChannelId = string;

export const STAT_SCALES = [
  "this tiny model",
  "Llama-3-8B",
  "Llama-3-8B on H100 SXM",
  "TinyStories",
] as const;
export type StatScale = (typeof STAT_SCALES)[number];

/** `nats`: a loss, the average surprise per token (natural-log units). */
export const STAT_FORMATS = ["int", "num", "bytes", "tok/s", "s", "pct", "x", "nats"] as const;
export type StatFormat = (typeof STAT_FORMATS)[number];

export interface ChapterDef {
  slug: ChapterSlug;
  title: string;
  /** Names the previous chapter's visible failure (D12). */
  why: string;
  model: ChapterModelId | null;
  scene: SceneBuilderId;
  caption: Caption;
  /**
   * The lesson's brief (`state/lesson.ts`): 2 or 3 storyteller sentences on a card before the
   * lesson plays, saying what it is about and what to watch for. The intro's sets up the series.
   */
  brief: string[];
  stats: [StatChip, StatChip, StatChip];
  /**
   * The chapter's one knob, only where it is a real knob of the mechanism (temperature, batch
   * size, bytes per weight, draft length, window size); a chapter without one has no slider.
   */
  slider?: SliderDef;
  scenarios: ScenarioDef[];
  /** Key parts only, at most 5 (D18). */
  labels: LabelDef[];
  loop: Timeline;
  shot: ShotId;
  /**
   * The one zoom-out (D5): while loop channel `channel` rises from 0 to 1 the camera eases from
   * wherever the reader has it to `shot`, and back as it falls. Only the stack chapter has one.
   */
  pullBack?: { shot: ShotId; channel: ChannelId };
  /**
   * A camera tour of the scene (the finished machine): loop channel `channel` counts stops,
   * fractional while the camera moves, and the scene builder (`SceneBuilder.tourPose`) places
   * the camera for each until the reader takes it. Only the stop in view shows its label, so
   * a toured chapter may list a label per stop: the cap (D18) holds for what is on screen.
   */
  tour?: { channel: ChannelId };
  /**
   * `notes` say how the scene itself was made where that is not obvious (e.g. a projection
   * computed offline); the help panel lists them under the chapter's numbers.
   */
  help: { sources: SourceRef[]; notes?: string[] };
  /** Loop time captured for the chapter's link-preview image. */
  ogTimeSec: number;
}

/** Two storyteller sentences, then the "Technical" line behind one click (copy rules). */
export interface Caption {
  story: [string, string];
  technical: string;
}

/**
 * A number on screen. It is always computed, never typed in: a metric of the chapter's model
 * (`MODEL_METRICS`), production arithmetic (`ARITH`), or a probe measured on the chapter's
 * model (its manifest `evidence`). `stats.ts` resolves it.
 */
export interface StatChip {
  id: string;
  label: string;
  format: StatFormat;
  scale: StatScale;
  value:
    | { kind: "model"; metric: ModelMetric }
    | { kind: "arith"; fn: ArithFnName; args: Record<string, ArithArg> }
    | { kind: "probe"; probe: string };
}

/**
 * An arithmetic argument: a fixed number, the HUD slider's value (so the chip follows the
 * reader's control; only in a chapter with a slider), or a probe measured on the chapter's
 * model (so a measured rate feeds a formula without being typed in).
 */
export type ArithArg = number | { slider: true } | { probe: string };

/** A part's label in both readings; the Analogy/Technical toggle picks one (D16). */
export interface LabelDef {
  anchor: AnchorId;
  analogy: string;
  technical: string;
}

export interface SliderDef {
  id: string;
  label: string;
  /** One sentence under the knob: what turning it changes (the story panel's step). */
  hint: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  /** What the HUD writes at the slider's top instead of its number (chapter 10: "all"). */
  maxLabel?: string;
  /**
   * A loop channel that plays the slider until the reader moves it: the HUD shows the
   * channel's value (rounded into range), so the chips follow the loop (chapter 11's riders).
   */
  loop?: ChannelId;
}

/** A preset prompt. It must cite a passing probe (O2). */
export interface ScenarioDef {
  id: string;
  label: string;
  prompt: string;
  probe: string;
}

export interface SourceRef {
  label: string;
  url: string;
}

export type Ease = "linear" | "inOut" | "step";

/** `ease` shapes the segment that ends at this keyframe (default linear). */
export interface Keyframe {
  t: number;
  v: number;
  ease?: Ease;
}

/** A named moment in the loop. `note` describes it for the filmstrip; it is not on-screen copy. */
export interface Beat {
  t: number;
  id: string;
  note: string;
  focus?: AnchorId;
  tint?: PaletteToken;
}

/**
 * The chapter's loop. The lesson plays it once, from 0 to `endSec`, then holds `endSec` for the
 * reader's turn; the recorded video loops the whole of it, so time wraps at `durationSec` and
 * interpolation wraps with it.
 */
export interface Timeline {
  durationSec: number;
  /**
   * Where the lesson's one pass ends: the moment its point is on screen, which the scene holds
   * while the reader takes over. What follows only brings the loop back to its start.
   */
  endSec: number;
  /**
   * What the loop feeds the chapter's model, in order (chapter 0: the words that land on the
   * rail). The app runs the real model on each; the scene's channels pick which one shows.
   */
  inputs?: string[];
  channels: Record<ChannelId, Keyframe[]>;
  beats: Beat[];
}
