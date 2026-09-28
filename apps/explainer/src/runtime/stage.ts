/**
 * The one frame loop: a canvas, the real renderer, orbit controls and pinned labels. Every
 * frame: clock → `update` (the app's timeline → buildFrame, or a lab fixture's tweak) → orbit
 * → renderer.frame → placeLabels (clear of the scene's own text) → label refs. The app and
 * every lab page run through it; it also installs the probe's `receipt`, `labels` and scene
 * crops (`part:*`, `text:*`).
 */
import {
  copyPose,
  cameraMatrices,
  createCameraMatrices,
  createRenderer,
  DEFAULT_LABEL_BOX,
  OrbitController,
  partWorldBounds,
  placeLabels,
  projectBox,
  sceneAnchors,
  sceneOccluders,
  type FrameInput,
  type FrameReceipt,
  type LabelBox,
  type LabelPlacement,
  type LookConfig,
  type Occluder,
  type OrbitPose,
  type Renderer,
  type ScreenRect,
  type TextRect,
  type WorldAnchor,
} from "@repo/renderer";
import type { Box3 } from "math/shapes";
import type { LabelsHandle } from "../hud/Labels.tsx";
import type { ProbeApi } from "../lab/probe.ts";
import { roomOrbitLimits } from "../scene/environment.ts";
import type { Clock } from "./clock.ts";
import { ARRIVAL_SEC, Arrival } from "./arrival.ts";
import { bindOrbit } from "./orbit-input.ts";

export interface StageOptions {
  canvas: HTMLCanvasElement;
  look: LookConfig;
  /** Everything but time and viewport, which the stage fills in. */
  input: Omit<FrameInput, "timeSec" | "viewport">;
  clock: Clock;
  probe: ProbeApi;
  /** Called once the first frames are on screen (or the stage failed). */
  onReady: () => void;
  /** Debug layers and bloom, e.g. from `?emissive=0&bloom=0`. */
  debug?: FrameInput["debug"];
  /**
   * Runs before each frame is drawn; mutates `input` (scene, transforms, dynamics).
   * Returning true means it steered the camera: the orbit continues from `input.camera`.
   */
  update?: (input: FrameInput, timeSec: number) => boolean | void;
  /** The reader pressed or scrolled on the canvas (took the camera). */
  onOrbitInput?: () => void;
  /** Adjusts the drawn camera from the orbit pose each frame (e.g. a turntable). */
  pose?: (pose: OrbitPose, timeSec: number) => void;
  /** The label layer to drive, for the scene's anchors. */
  labels?: LabelsHandle | null;
  /** Screen rects labels must keep clear of besides the scene's text (the HUD panels). */
  obstacles?: () => readonly ScreenRect[];
}

export interface Stage {
  renderer: Renderer;
  input: FrameInput;
  /** Cuts the camera to `pose`. */
  jumpTo(pose: OrbitPose): void;
  /**
   * Arrives at `pose` (a chapter's hero shot): with `from`, eases in from it over
   * `durationSec` (the arrival move, D42), else cuts. Orbit input cancels the move.
   */
  arrive(pose: OrbitPose, from?: OrbitPose, durationSec?: number): void;
  /** Whether the arrival move is still running (the chapter loop waits for it). */
  arriving(): boolean;
  dispose(): void;
}

export async function runStage(o: StageOptions): Promise<Stage | null> {
  const created = await createRenderer(o.canvas, o.look);
  if ("unsupported" in created) {
    o.probe.errors.push(`renderer unsupported: ${created.unsupported}`);
    o.onReady();
    return null;
  }
  const renderer = created;
  const input: FrameInput = {
    ...o.input,
    timeSec: 0,
    viewport: { width: 1, height: 1 },
    debug: o.debug,
  };
  // Inside a room the camera stays inside it; a bare fixture keeps the open-stage limits.
  const orbit = new OrbitController(
    input.camera,
    input.scene.environment ? roomOrbitLimits() : undefined,
  );
  const pose: OrbitPose = { ...orbit.pose, target: [...orbit.pose.target] };
  input.camera = pose;

  const { canvas } = o;
  let arrival: Arrival | null = null;
  const unbind = bindOrbit(canvas, orbit, () => {
    arrival?.cancel();
    o.onOrbitInput?.();
  });
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  const matrices = createCameraMatrices();
  const labelAnchors: WorldAnchor[] = [];
  const labelPlacements: LabelPlacement[] = [];
  const obstacles: ScreenRect[] = [];
  const textRects: TextRect[] = [];
  // Occluders change with the scene's structure or its layout; anchors move every frame.
  const occludedFor = { revision: -1, layout: -1 };
  let occluders: Occluder[] = [];
  const placeAll = () => {
    const { scene } = input;
    if (occludedFor.revision !== scene.revision || occludedFor.layout !== (scene.layout ?? 0)) {
      occluders = sceneOccluders(scene, o.look);
      occludedFor.revision = scene.revision;
      occludedFor.layout = scene.layout ?? 0;
    }
    cameraMatrices(input.camera, input.viewport, matrices);
    // Labels steer clear of the text written in the scene.
    obstacles.length = 0;
    for (const rect of renderer.textRects(matrices, textRects)) obstacles.push(rect);
    if (o.obstacles) for (const rect of o.obstacles()) obstacles.push(rect);
    sceneAnchors(scene, scene.anchors, labelAnchors);
    const widths = o.labels?.pillWidths();
    for (const anchor of labelAnchors) anchor.pillWidth = widths?.[anchor.id];
    placeLabels(matrices, labelAnchors, occluders, labelPlacements, DEFAULT_LABEL_BOX, obstacles);
    o.labels?.update(labelPlacements);
  };

  let receipt: FrameReceipt | null = null;
  let frames = 0;
  let last = o.clock.now();
  let raf = 0;
  const tick = () => {
    const now = o.clock.now();
    const moving = arrival?.at(now);
    if (moving) orbit.jumpTo(moving);
    const current = orbit.update(now - last);
    last = now;
    copyPose(pose, current);
    o.pose?.(pose, now);
    input.timeSec = now;
    input.viewport.width = canvas.clientWidth;
    input.viewport.height = canvas.clientHeight;
    if (o.update?.(input, now) === true) orbit.jumpTo(input.camera);
    receipt = renderer.frame(input);
    placeAll();
    if (++frames === 2) o.onReady();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const box: Box3 = [0, 0, 0, 0, 0, 0];
  o.probe.receipt = () => receipt!;
  o.probe.labels = () => labelPlacements.map((p) => ({ ...p }));
  o.probe.sceneCrops = () => {
    cameraMatrices(input.camera, input.viewport, matrices);
    const crops: Record<string, ScreenRect> = { ...o.labels?.rects() };
    for (const part of input.scene.parts) {
      const rect = projectBox(matrices, partWorldBounds(part, input.scene.assets, box));
      if (rect) crops[`part:${part.id}`] = rect;
    }
    for (const { id, ...rect } of renderer.textRects(matrices, [])) crops[`text:${id}`] = rect;
    return crops;
  };

  return {
    renderer,
    input,
    jumpTo(target) {
      arrival?.cancel();
      orbit.jumpTo(target);
    },
    arrive(target, from, durationSec = ARRIVAL_SEC) {
      arrival?.cancel();
      arrival = from ? new Arrival(from, target, durationSec) : null;
      orbit.jumpTo(from ?? target);
    },
    arriving() {
      return arrival !== null && !arrival.done;
    },
    dispose() {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      unbind();
      renderer.dispose();
    },
  };
}
