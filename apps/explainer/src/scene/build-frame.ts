/**
 * The domain → renderer adapter (pure: no DOM, no GPU). A chapter's data, its loop state,
 * the HUD controls and the model's real output become the renderer's `FrameInput`, the words
 * written on its parts included. Each chapter names a scene builder; the builder creates its
 * parts once (a new `revision`) and then updates transforms and dynamics in place every frame.
 */
import type { FrameInput, OrbitPose, SceneDesc } from "@repo/renderer";
import type { ChapterDef, ChapterSlug, SceneBuilderId } from "../chapters/types.ts";
import type { TimelineState } from "../chapters/timeline.ts";
import { attention, positions, type AttentionRun } from "./builders/attention.ts";
import { autocomplete, type CountsRun } from "./builders/autocomplete.ts";
import { embeddings } from "./builders/embeddings.ts";
import { generation, type GenerationRun } from "./builders/generation.ts";
import { kvCache, type KvRun } from "./builders/kv-cache.ts";
import { mlp, type MlpRun } from "./builders/mlp.ts";
import { residual, type ResidualRun } from "./builders/residual.ts";
import { sampling, type LogitsRun } from "./builders/sampling.ts";
import { stack, type StackRun } from "./builders/stack.ts";
import { tokenizer } from "./builders/tokenizer.ts";
import { batching } from "./builders/batching.ts";
import { quantization } from "./builders/quantization.ts";
import { speculative } from "./builders/speculative.ts";
import { experts } from "./builders/experts.ts";
import { finishedScene } from "./builders/finished.ts";
import { withEnvironment } from "./environment.ts";
import { nextRevision } from "./revision.ts";

/** The HUD controls a scene reads. */
export interface SceneUi {
  /** The chapter slider's value (0 in a chapter without one). */
  slider: number;
  /** Whether the reader moved the slider; until then a scene may play its own value for it. */
  sliderSet: boolean;
  /** Text the reader typed (or a scenario's prompt); it replaces the loop's inputs. */
  text: string | null;
}

/** The controls as a chapter opens: each at its default, the loop's inputs untouched. */
export function defaultUi(def: ChapterDef): SceneUi {
  return {
    slider: def.slider?.initial ?? 0,
    sliderSet: false,
    text: null,
  };
}

/**
 * The chapter's model output for what the scene shows (`runtime/scene-run.ts`). Each scene's
 * builder reads its own kind.
 */
export type SceneRun =
  | CountsRun
  | PiecesRun
  | PinsRun
  | LogitsRun
  | MlpRun
  | ResidualRun
  | StackRun
  | GenerationRun
  | KvRun
  | QuantizationRun
  | SpeculativeRun
  | ExpertsRun
  | AttentionRun
  | FinishedRun;

/**
 * Chapter 15's run (`runtime/runs/finished.ts`): each station's own chapter run, by slug, as
 * that chapter computes it on its own model.
 */
export interface FinishedRun {
  kind: "finished";
  runs: Partial<Record<ChapterSlug, SceneRun | null>>;
}

/** Chapter 1's run (`runtime/runs/tokenizer.ts`). */
export interface PiecesRun {
  kind: "pieces";
  /** Entries in the tokenizer's vocabulary: the box of shapes. */
  vocab: number;
  /**
   * One step per loop input (or one for typed text): the text and its tokenizer pieces,
   * each with its id, its text (a leading space included) and its length in bytes.
   */
  steps: { text: string; pieces: { id: number; text: string; bytes: number }[] }[];
}

/** Chapter 2's run (`runtime/runs/embeddings.ts`). */
export interface PinsRun {
  kind: "pins";
  /**
   * One step per loop input (or one for typed text): its tokens, each at its embedding's
   * projection on the map (`scene/embed-map.ts`), and the cosine similarity of the first
   * two tokens' embeddings when there are two.
   */
  steps: {
    text: string;
    pins: { id: number; text: string; bytes: number; at: [number, number, number] }[];
    cosine: number | null;
  }[];
}

/** Chapter 14's run (`runtime/runs/experts.ts`). */
export interface ExpertsRun {
  kind: "experts";
  prompt: string;
  /** The layer whose router the desk shows (0-based), of `layers`. */
  layer: number;
  layers: number;
  experts: number;
  /** Each routed token: its text, its chosen experts (best first) and their weights. */
  tokens: { text: string; experts: number[]; weights: number[] }[];
  /** Each expert's share of routing slots on held-out text (the `expert-usage-<e>` probes). */
  usage: number[];
}

/** Chapter 13's run (`runtime/runs/speculative.ts`). */
export interface SpeculativeRun {
  kind: "speculative";
  /** The text being continued. */
  prompt: string;
  /**
   * The seeded rounds for each k the slider offers: the drafter's guessed words, how many the
   * target kept from the front, and the target's own word (a correction, or a bonus; `null`
   * when a kept `<eos>` ended the story).
   */
  byK: { k: number; rounds: { drafted: string[]; accepted: number; next: string | null }[] }[];
}

/** Chapter 12's run (`runtime/runs/quantization.ts`). */
export interface QuantizationRun {
  kind: "quantization";
  /** The text both machines continue (the loop's input, or the reader's text). */
  prompt: string;
  /** Each machine's greedy words after it: the 16-bit `full` and its 8-bit copy. */
  full: string[];
  q8: string[];
  /**
   * One q8_0 group of weights: `full`'s stored 16-bit values, and `full-q8`'s `scale · q`
   * with its scale and integers.
   */
  strip: {
    tensor: string;
    start: number;
    count: number;
    full: number[];
    q8: number[];
    scale: number;
    q: number[];
  };
  /** The measured weights-file ratio, 8-bit ÷ 16-bit (the `q8-bytes` probe). */
  byteRatio: number;
}

export interface SceneBuilder {
  /** Prop URLs by asset id; the app loads them before the first frame. */
  assets: Record<string, string>;
  /** The scene with its parts and the text written on them (`SceneDesc.text`). */
  create(assets: SceneDesc["assets"], revision: number): SceneDesc;
  update(
    frame: SceneFrame,
    def: ChapterDef,
    tl: TimelineState,
    ui: SceneUi,
    run: SceneRun | null,
  ): void;
  /**
   * A toured scene's camera (`ChapterDef.tour`) at this moment of its loop, written into `out`.
   * The app draws it until the reader takes the camera.
   */
  tourPose?(def: ChapterDef, tl: TimelineState, ui: SceneUi, out: OrbitPose): OrbitPose;
}

/** The scenes that stand on their own: every chapter's but the finished machine's. */
const PART_BUILDERS: Record<Exclude<SceneBuilderId, "finished">, SceneBuilder> = {
  autocomplete,
  tokenizer,
  embeddings,
  sampling,
  attention,
  positions,
  mlp,
  residual,
  stack,
  generation,
  "kv-cache": kvCache,
  batching,
  quantization,
  speculative,
  experts,
};

export const SCENE_BUILDERS: Record<SceneBuilderId, SceneBuilder> = {
  ...PART_BUILDERS,
  finished: finishedScene(PART_BUILDERS, buildFrame),
};

/** What one frame of a chapter's scene is: the renderer's input, from the builder it came from. */
export interface SceneFrame {
  builder: SceneBuilderId | null;
  input: Omit<FrameInput, "timeSec" | "viewport">;
  /**
   * Seconds on the one clock, always running while the loop plays or holds (the stage's
   * `FrameInput.timeSec`; a held or stepped clock holds or steps it). Purely decorative motion
   * runs on it (flow pulses, a station's breathing), so the scene stays alive when the lesson
   * holds its last beat; everything the lesson shows runs on the loop's time.
   */
  ambientSec: number;
}

export function createSceneFrame(input: SceneFrame["input"], ambientSec = 0): SceneFrame {
  return { builder: null, input, ambientSec };
}

/**
 * Writes the chapter's scene at loop state `tl` into `out` and returns its frame input.
 * Switching scene builders rebuilds the scene; otherwise nothing is allocated. `out.input`'s
 * camera and debug are the caller's.
 */
export function buildFrame(
  def: ChapterDef,
  tl: TimelineState,
  ui: SceneUi,
  run: SceneRun | null,
  out: SceneFrame,
): SceneFrame["input"] {
  const builder = SCENE_BUILDERS[def.scene];
  if (out.builder !== def.scene) {
    const created = builder.create(out.input.scene.assets, nextRevision());
    out.input.scene = withEnvironment(created);
    const slots = created.parts.reduce((n, p) => Math.max(n, p.slot + 1), 1);
    out.input.dynamics = {
      intensity: new Float32Array(slots).fill(1),
      widthScale: new Float32Array(slots).fill(1),
      flowPhase: new Float32Array(slots),
    };
    out.builder = def.scene;
  }
  builder.update(out, def, tl, ui, run);
  return out.input;
}
