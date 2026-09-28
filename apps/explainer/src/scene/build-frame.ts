/**
 * The domain → renderer adapter (pure: no DOM, no GPU). A chapter's data, its loop state,
 * the HUD controls and the model's real output become the renderer's `FrameInput`, plus the
 * scene text the overlay draws. Each chapter names a scene builder; the builder creates its
 * parts once (a new `revision`) and then updates transforms and dynamics in place every frame.
 */
import type { FrameInput, SceneDesc } from "@repo/renderer";
import type { ChapterDef, FollowId, SceneBuilderId, ViewMode } from "../chapters/types.ts";
import type { TimelineState } from "../chapters/timeline.ts";
import type { SceneTags } from "../hud/SceneTags.tsx";
import { autocomplete, type CountsRun } from "./builders/autocomplete.ts";
import { embeddings } from "./builders/embeddings.ts";
import { mlp, type MlpRun } from "./builders/mlp.ts";
import { residual, type ResidualRun } from "./builders/residual.ts";
import { sampling, type LogitsRun } from "./builders/sampling.ts";
import { stack, type StackRun } from "./builders/stack.ts";
import { tokenizer } from "./builders/tokenizer.ts";
import { batching } from "./builders/batching.ts";
import { quantization } from "./builders/quantization.ts";
import { withEnvironment } from "./environment.ts";

/** The HUD controls a scene reads. */
export interface SceneUi {
  follow: FollowId | null;
  slider: number;
  /** Whether the reader moved the slider; until then a scene may play its own value for it. */
  sliderSet: boolean;
  view: ViewMode;
  /** Text the reader typed (or a scenario's prompt); it replaces the loop's inputs. */
  text: string | null;
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
  | QuantizationRun;

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
  /** How many scene tags the builder writes. */
  tagCount: number;
  create(assets: SceneDesc["assets"], revision: number): { scene: SceneDesc; tags: SceneTags };
  update(
    frame: SceneFrame,
    def: ChapterDef,
    tl: TimelineState,
    ui: SceneUi,
    run: SceneRun | null,
  ): void;
}

export const SCENE_BUILDERS: Record<SceneBuilderId, SceneBuilder> = {
  autocomplete,
  tokenizer,
  embeddings,
  sampling,
  mlp,
  residual,
  stack,
  batching,
  quantization,
};

/** What one frame of a chapter's scene is: the renderer's input and the overlay's text. */
export interface SceneFrame {
  builder: SceneBuilderId | null;
  input: Omit<FrameInput, "timeSec" | "viewport">;
  tags: SceneTags;
}

let revisions = 0;

export function createSceneFrame(input: SceneFrame["input"]): SceneFrame {
  return { builder: null, input, tags: { anchors: [], text: [], emphasis: [] } };
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
    const created = builder.create(out.input.scene.assets, ++revisions);
    out.input.scene = withEnvironment(created.scene);
    out.tags = created.tags;
    const slots = created.scene.parts.reduce((n, p) => Math.max(n, p.slot + 1), 1);
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
