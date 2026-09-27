/**
 * The domain → renderer adapter (pure: no DOM, no GPU). A chapter's data, its loop state,
 * the HUD controls and the model's real output become the renderer's `FrameInput`, plus the
 * scene text the overlay draws. Each chapter names a scene builder; the builder creates its
 * parts once (a new `revision`) and then updates transforms and dynamics in place every frame.
 */
import type { NextWord } from "@repo/llm";
import type { FrameInput, SceneDesc } from "@repo/renderer";
import type { ChapterDef, FollowId, SceneBuilderId, ViewMode } from "../chapters/types.ts";
import type { TimelineState } from "../chapters/timeline.ts";
import type { SceneTags } from "../hud/SceneTags.tsx";
import { attention } from "./builders/attention.ts";
import { autocomplete } from "./builders/autocomplete.ts";
import { withEnvironment } from "./environment.ts";
import { nextRevision } from "./revision.ts";

/** The HUD controls a scene reads. */
export interface SceneUi {
  follow: FollowId | null;
  slider: number;
  view: ViewMode;
  /** Text the reader typed (or a scenario's prompt); it replaces the loop's inputs. */
  text: string | null;
}

/** The chapter's model output for what the scene shows (computed by the session worker). */
export type SceneRun =
  | {
      kind: "counts";
      /** One step per loop input (or one for typed text): the word and its real successors. */
      steps: { word: string; next: NextWord[] }[];
    }
  | {
      kind: "attention";
      /** One step per loop input (or one for typed text). */
      steps: AttentionStep[];
    };

/** One prompt through a one-layer attention model, seen from its last token (the focus). */
export interface AttentionStep {
  /** Every token as text: `<bos>`, the prompt, then the words the model writes next. */
  tokens: string[];
  /** The focus token's index: the prompt's last. */
  focus: number;
  /**
   * The focus token's real attention weights over every token (layer 0, head 0); the causal
   * mask makes every weight after the focus exactly 0.
   */
  weights: number[];
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

export const SCENE_BUILDERS: Record<SceneBuilderId, SceneBuilder> = { autocomplete, attention };

/** What one frame of a chapter's scene is: the renderer's input and the overlay's text. */
export interface SceneFrame {
  builder: SceneBuilderId | null;
  input: Omit<FrameInput, "timeSec" | "viewport">;
  tags: SceneTags;
}

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
    const created = builder.create(out.input.scene.assets, nextRevision());
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
