/**
 * A chapter is pure data (slice 03). The HUD, the loop, the stats and the scene are all
 * driven by a `ChapterDef`; `validateChapter()` enforces the copy rules and references.
 */
import type shots from "../look/shots.json";
import type { PaletteToken } from "../look/look.ts";
import type { ChapterSlug } from "./ladder.ts";
import type { AnchorId, SceneBuilderId } from "./scenes.ts";

export type { AnchorId, ChapterSlug, SceneBuilderId };

/** Trained model ids (README Chapters table). */
export type ModelId =
  | "counts"
  | "embed"
  | "attn"
  | "rope"
  | "mlp"
  | "residual"
  | "full"
  | "full-q8"
  | "drafter"
  | "moe";

export type ShotId = keyof typeof shots;
export type FollowId = string;
export type ChannelId = string;
export type ViewMode = "whole" | "cutaway" | "exploded";

export const STAT_SCALES = [
  "this tiny model",
  "Llama-3-8B",
  "Llama-3-8B on H100 SXM",
  "TinyStories",
] as const;
export type StatScale = (typeof STAT_SCALES)[number];

export const STAT_FORMATS = ["int", "bytes", "tok/s", "pct", "x"] as const;
export type StatFormat = (typeof STAT_FORMATS)[number];

export interface ChapterDef {
  slug: ChapterSlug;
  title: string;
  /** Names the previous chapter's visible failure (D12). */
  why: string;
  model: ModelId | null;
  scene: SceneBuilderId;
  caption: { default: Caption; byFollow: Partial<Record<FollowId, Caption>> };
  stats: [StatChip, StatChip, StatChip];
  /** At most 3; "All" is implicit. Keys 1–4 select All then these, in order. */
  follow: FollowTarget[];
  slider: SliderDef;
  scenarios: ScenarioDef[];
  views: ViewMode[];
  /** Key parts only, at most 5 (D18). */
  labels: LabelDef[];
  loop: Timeline;
  shot: ShotId;
  help: { sources: SourceRef[] };
  /** Loop time captured for the chapter's link-preview image. */
  ogTimeSec: number;
}

/** Two storyteller sentences, then the "Precisely:" line behind one click (copy rules). */
export interface Caption {
  story: [string, string];
  precisely: string;
}

/** A number on screen. It is always computed from a model, arithmetic or a probe, never typed in. */
export interface StatChip {
  id: string;
  label: string;
  format: StatFormat;
  scale: StatScale;
  value:
    | { kind: "model"; metric: string }
    | { kind: "arith"; fn: string; args: Record<string, number> }
    | { kind: "probe"; probe: string };
}

export interface FollowTarget {
  id: FollowId;
  label: string;
  anchor: AnchorId;
}

/** A part's label in both readings; the Analogy/Precise toggle picks one (D16). */
export interface LabelDef {
  anchor: AnchorId;
  analogy: string;
  precise: string;
}

export interface SliderDef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
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

/** The arrival loop (D24). It wraps at `durationSec`, and interpolation wraps with it. */
export interface Timeline {
  durationSec: number;
  channels: Record<ChannelId, Keyframe[]>;
  beats: Beat[];
}
